import {NextResponse} from "next/server";
import {getRedisInstance, REDIS_KEY_PREFIX_FRAMES} from "@db/redis/redis";
import {join} from "path";
import {readFile} from "fs/promises";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Frame} from "@db/entities/Frame";
import {Event} from "@db/entities/Event";
import {BatchEvent, FrameCase} from "@definitions/simulation/types";
import {SimulationData} from "@definitions/api/types";
import {groupEvents} from "@utils/events";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {formatDateString} from "@utils/dateHelpers";

export const GET = async (
    request: Request,
    context: { params: { id: string } }
): Promise<NextResponse<SimulationData | {error: string}>> => {
    try {
        const params = await context.params;
        const processId = params.id;
        const limit = 15;

        const appDataSource = await createMySQLConnection();
        const processRepository = appDataSource.getRepository(Process);

        const simulationProcess = await processRepository
            .createQueryBuilder("process")
            .select([
                "process.id AS id",
                "process.fileName AS fileName",
                "CAST(process.endDate AS CHAR) AS endDate",
                "CAST(process.startDate AS CHAR) AS startDate"
            ])
            .where("process.id = :id", { id: processId })
            .getRawOne();

        const startDate = new Date(simulationProcess.startDate + "Z");
        const rawEndDate = new Date(simulationProcess.startDate + "Z");
        rawEndDate.setMinutes(0, 0, 0);
        rawEndDate.setHours(rawEndDate.getHours() + limit);

        const simulationFinishDate = new Date(simulationProcess.endDate + "Z");
        const endDate = rawEndDate < simulationFinishDate ? rawEndDate : simulationFinishDate;

        const simulationHasFinished = endDate === simulationFinishDate;
        const endDateOperator = simulationHasFinished ? "<=" : "<";

        const events: Event[] = await appDataSource.query(`
            SELECT *, CAST(timestamp AS CHAR) AS timestamp
            FROM event
            WHERE processId = ? AND timestamp >= ? AND timestamp ${endDateOperator} ?
        `, [
            processId,
            formatDateString(startDate),
            formatDateString(endDate),
        ]);
        const batchEvents: Array<BatchEvent> = events.map(event => ({
            case_id: event.caseId,
            lifecycle: event.lifecycle as LifecycleTypes,
            timestamp: event.timestamp,
            node_id: event.nodeId,
            paths: event.paths,
        }));
        const batches = groupEvents(batchEvents, startDate.toISOString(), endDate.toISOString());

        const redis = getRedisInstance();
        const redisKey = REDIS_KEY_PREFIX_FRAMES + processId;
        const stringFrames = await redis.get(redisKey);
        let frames: Array<FrameCase>;

        if (!stringFrames) {
            frames = await appDataSource.getRepository(Frame)
                .createQueryBuilder("frame")
                .select([
                    "frame.caseId as case_id",
                    "frame.activeElements as active_elements"
                ])
                .where("frame.processId = :processId", { processId })
                .getRawMany();

            await redis.set(redisKey, JSON.stringify(frames), 'EX', 60*60*24);
        } else {
            frames = JSON.parse(stringFrames);
        }

        redis.disconnect();

        const filePath = join(process.cwd(), 'public/assets', simulationProcess.fileName);
        const file = await readFile(filePath);

        return NextResponse.json({
            processId,
            batches,
            frames,
            file,
            startDate: simulationProcess.startDate,
            endDate: simulationProcess.endDate,
            pointer: simulationHasFinished ? -1 : limit,
        }, { status: 200 });
    } catch (e) {
        console.log(e)
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}
