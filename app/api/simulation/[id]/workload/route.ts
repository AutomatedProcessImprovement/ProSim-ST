import {NextResponse} from "next/server";
import {getRedisInstance, REDIS_KEY_PREFIX_FRAMES, REDIS_KEY_PREFIX_WORKLOAD} from "@db/redis/redis";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {Frame} from "@db/entities/Frame";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {FrameCase} from "@definitions/simulation/types";
import {buildWorkloadSeries} from "@utils/workload";

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<Array<number> | {error: string}>> => {
    try {
        const params = await context.params;
        const processId = params.id;
        const redis = getRedisInstance();
        const redisKeyWorkload = REDIS_KEY_PREFIX_WORKLOAD + processId;

        const cachedWorkload = await redis.get(redisKeyWorkload);
        if (cachedWorkload) {
            return NextResponse.json(JSON.parse(cachedWorkload), { status: 200 });
        }

        const appDataSource = await createMySQLConnection();

        const process = await appDataSource.getRepository(Process).findOneBy({ id: processId });
        if (!process?.startDate || !process?.endDate) {
            return NextResponse.json({ error: "Process not found or missing start/end dates" }, { status: 404 });
        }

        const events: Event[] = await appDataSource.getRepository(Event)
            .createQueryBuilder("event")
            .where("event.processId = :processId", { processId })
            .andWhere("event.lifecycle IN (:...types)", {
                types: [LifecycleTypes.CASE_ARRIVAL, LifecycleTypes.CASE_END],
            })
            .orderBy("event.timestamp", "ASC")
            .getMany();

        let frames: Array<FrameCase>;
        const redisKeyFrames = REDIS_KEY_PREFIX_FRAMES + processId
        const frameCache = await redis.get(redisKeyFrames);

        if (frameCache) {
            frames = JSON.parse(frameCache) as Array<FrameCase>;
        } else {
            frames = await appDataSource.getRepository(Frame).find({ where: { processId } });
        }

        const result = buildWorkloadSeries(events, frames, process.startDate, process.endDate);

        await redis.set(redisKeyWorkload, JSON.stringify(result), 'EX', 60 * 60 * 24);
        redis.disconnect();

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to get workload data." }, { status: 500 });
    }
}
