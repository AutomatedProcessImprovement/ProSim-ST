import {NextResponse} from "next/server";
import {getRedisInstance} from "@db/redis/redis";
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

export const GET = async (request: Request, context: { params: { id: string } }): Promise<
    NextResponse<SimulationData | {error: string}>
> => {
    try {
        const params = await context.params;
        const processId = params.id;

        const appDataSource = await createMySQLConnection();
        const processRepository = appDataSource.getRepository(Process);

        const simulationProcess = await processRepository.findOneOrFail({
            where: { id: processId },
        });

        const rawStartDate = new Date(simulationProcess.startDate);
        const startDate = rawStartDate;

        const ceilHour = new Date(rawStartDate);
        ceilHour.setMinutes(0, 0, 0);
        ceilHour.setHours(ceilHour.getHours() + 1);

        const rawEndDate = new Date(ceilHour);
        rawEndDate.setHours(rawEndDate.getHours() + 14);

        const endDate = rawEndDate < new Date(simulationProcess.endDate) ? rawEndDate : new Date(simulationProcess.endDate);

        const events = await appDataSource.getRepository(Event)
            .createQueryBuilder("event")
            .where("event.processId = :processId", { processId })
            .andWhere("event.timestamp >= :startDate", { startDate })
            .andWhere("event.timestamp < :endDate", { endDate })
            .getMany();
        const batchEvents: Array<BatchEvent> = events.map(event => ({
            case_id: event.caseId,
            lifecycle: event.lifecycle as LifecycleTypes,
            timestamp: event.timestamp,
            node_id: event.nodeId,
            paths: event.paths,
        }));
        const batches = groupEvents(batchEvents, startDate.toISOString(), endDate.toISOString());

        const redis = getRedisInstance();
        const stringFrames = await redis.get(processId);
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

            await redis.set(processId, JSON.stringify(frames), 'EX', 60*60*24);
        } else {
            frames = JSON.parse(stringFrames);
        }

        redis.disconnect();

        const filePath = join(process.cwd(), 'public/assets', simulationProcess.fileName);
        const file = await readFile(filePath);

        return NextResponse.json({ processId, batches, frames, file }, { status: 200 });
    } catch (e) {
        console.log(e)
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}
