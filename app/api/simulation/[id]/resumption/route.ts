import {NextResponse} from "next/server";
import {ResumeSimulationResponse} from "@definitions/api/types";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {BatchEvent} from "@definitions/simulation/types";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {formatDateString, getHourDifference} from "@utils/dateHelpers";
import {groupEvents} from "@utils/events";
import {buildWTPTState} from "@utils/wtpt";
import {getRedisInstance} from "@db/redis/redis";
import {loadInitialFrames} from "@db/mysql/frames";
import {replayOpenCases} from "@modules/simulation/frameStateHelpers";

export const POST = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ResumeSimulationResponse | {error: string}>> => {
    try {
        const { requestedDate } = await request.json();
        const params = await context.params;
        const processId = params.id;
        const limit = 15;
        const startDate = new Date(requestedDate);
        const appDataSource = await createMySQLConnection();
        const processRepository = appDataSource.getRepository(Process);

        const simulationProcess = await processRepository
            .createQueryBuilder("process")
            .select([
                "process.id AS id",
                "process.fileName AS fileName",
                "CAST(process.endDate AS CHAR) AS endDate",
                "CAST(process.startDate AS CHAR) AS startDate",
                "process.setToDelete AS setToDelete"
            ])
            .where("process.id = :id", { id: processId })
            .getRawOne();

        if (!simulationProcess) {
            return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }

        if (simulationProcess.setToDelete) {
            return NextResponse.json({ error: "Process is marked for deletion" }, { status: 410 });
        }

        await processRepository.update({ id: processId }, { lastAccessedAt: new Date() });

        const simulationStartDate = new Date(simulationProcess.startDate + "Z");
        const simulationFinishDate = new Date(simulationProcess.endDate + "Z");

        const finishedCasesResult = await appDataSource
            .createQueryBuilder(Event, "event")
            .where("event.processId = :processId", { processId })
            .andWhere("event.lifecycle = :lifecycle", { lifecycle: LifecycleTypes.CASE_END })
            .andWhere("event.timestamp <= :requestedDate", { requestedDate: formatDateString(startDate) })
            .select("COUNT(DISTINCT event.caseId)", "count")
            .getRawOne();
        const finishedCasesNumber = parseInt(finishedCasesResult.count, 10);

        const wtptEvents: Array<{
            nodeId: string;
            caseId: number;
            lifecycle: LifecycleTypes;
            timestamp: string;
        }> = await appDataSource.query(`
            SELECT 
                event.nodeId AS nodeId,
                event.caseId AS caseId,
                event.lifecycle AS lifecycle,
                CAST(event.timestamp AS CHAR) AS timestamp
            FROM event
            WHERE event.processId = ?
                AND event.timestamp <= ?
                AND event.lifecycle IN (?, ?, ?)
                AND event.nodeId IS NOT NULL
            ORDER BY 
                event.timestamp ASC,
                FIELD(event.lifecycle, 'ENABLE', 'START', 'COMPLETE') ASC,
                event.id ASC
        `, [
            processId,
            formatDateString(startDate),
            LifecycleTypes.ENABLE,
            LifecycleTypes.START,
            LifecycleTypes.COMPLETE,
        ]);

        const redis = getRedisInstance();
        const openCases = await loadInitialFrames(redis, appDataSource, processId);
        redis.disconnect();
        const wtpt = buildWTPTState(wtptEvents, openCases);

        if (startDate >= simulationFinishDate) {
            return NextResponse.json({
                frames: [],
                batches: [],
                finishedCasesNumber,
                wtpt,
                pointer: -1,
            }, { status: 200 });
        }

        const rawEndDate = new Date(requestedDate);
        rawEndDate.setMinutes(0, 0, 0);
        rawEndDate.setHours(rawEndDate.getHours() + limit);
        const endDate = rawEndDate < simulationFinishDate ? rawEndDate : simulationFinishDate;
        const simulationHasFinished = endDate === simulationFinishDate;
        const endDateOperator = simulationHasFinished ? "<=" : "<";

        const events: Event[] = await appDataSource.query(`
            SELECT *, CAST(timestamp AS CHAR) AS timestamp
            FROM event
            WHERE processId = ? AND event.timestamp >= ? AND event.timestamp ${endDateOperator} ?
        `, [
            processId,
            formatDateString(startDate),
            formatDateString(endDate),
        ]);
        const batchEvents: Array<BatchEvent> = events.map(event => ({
            caseId: event.caseId,
            lifecycle: event.lifecycle as LifecycleTypes,
            timestamp: event.timestamp,
            nodeId: event.nodeId,
            paths: event.paths,
        }));
        const batches = groupEvents(batchEvents, startDate.toISOString(), endDate.toISOString());

        const previousEvents: Array<Pick<BatchEvent, "caseId" | "lifecycle" | "paths">> = await appDataSource.query(`
            SELECT event.caseId, event.lifecycle, event.paths
            FROM event
            WHERE event.processId = ? AND event.timestamp < ?
                AND (event.lifecycle = ? OR event.caseId NOT IN (
                    SELECT finished.caseId
                    FROM event AS finished
                    WHERE finished.processId = ? AND finished.lifecycle = ? AND finished.timestamp < ?
                ))
            ORDER BY event.id ASC
        `, [
            processId,
            formatDateString(startDate),
            LifecycleTypes.CASE_END,
            processId,
            LifecycleTypes.CASE_END,
            formatDateString(startDate),
        ]);
        const frames = replayOpenCases(openCases, previousEvents);

        return NextResponse.json({
            frames,
            batches,
            finishedCasesNumber,
            wtpt,
            pointer: simulationHasFinished ? -1 : getHourDifference(simulationStartDate, endDate),
        }, { status: 200 });
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}

