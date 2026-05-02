import {NextResponse} from "next/server";
import {PollingData} from "@definitions/api/types";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {BatchEvent} from "@definitions/simulation/types";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {groupEvents} from "@utils/events";
import {formatDateString} from "@utils/dateHelpers";
import {multiplyBatches} from "@utils/multiplySimulationData";

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<PollingData | {error: string}>> => {
    try {
        const params = await context.params;
        const processId = params.id;
        const { searchParams } = new URL(request.url);
        const pointer = parseInt(searchParams.get("pointer") || "0", 10);
        const limit = parseInt(searchParams.get("limit") || "10", 10);
        const scale = parseInt(searchParams.get("scale") ?? "1", 10);

        const appDataSource = await createMySQLConnection();
        const processRepository = appDataSource.getRepository(Process);

        const simulationProcess = await processRepository
            .createQueryBuilder("process")
            .select([
                "process.id AS id",
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

        // Update lastAccessedAt
        await processRepository.update({ id: processId }, { lastAccessedAt: new Date() });

        const startDate = new Date(simulationProcess.startDate + "Z");
        startDate.setMinutes(0, 0, 0);
        startDate.setHours(startDate.getHours() + pointer);

        const simulationFinishDate = new Date(simulationProcess.endDate + "Z");
        if (startDate >= simulationFinishDate) {
            return NextResponse.json({
                batches: [],
                pointer: -1,
            }, { status: 200 });
        }

        const rawEndDate = new Date(startDate);
        rawEndDate.setHours(rawEndDate.getHours() + limit);
        const endDate = rawEndDate < simulationFinishDate ? rawEndDate : simulationFinishDate;

        const simulationHasFinished = endDate === simulationFinishDate
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
            caseId: event.caseId,
            lifecycle: event.lifecycle as LifecycleTypes,
            timestamp: event.timestamp,
            nodeId: event.nodeId,
            paths: event.paths,
        }));
        const batches = groupEvents(batchEvents, startDate.toISOString(), endDate.toISOString());

        return NextResponse.json({
            batches: multiplyBatches(batches, scale),
            pointer: simulationHasFinished ? -1 : pointer + limit,
        }, { status: 200 });
    } catch (e) {
        console.log(e)
        return NextResponse.json({ error: "Failed to fetch batches." }, { status: 500 });
    }
}
