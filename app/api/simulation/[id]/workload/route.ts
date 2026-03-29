import {NextResponse} from "next/server";
import {getRedisInstance, REDIS_KEY_PREFIX_FRAMES, REDIS_KEY_PREFIX_WORKLOAD} from "@db/redis/redis";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {Frame} from "@db/entities/Frame";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {FrameCase} from "@definitions/simulation/types";

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

        const arrivalTimes = new Map<string, Date>();
        const endTimes = new Map<string, Date>();

        for (const event of events) {
            switch (event.lifecycle) {
                case LifecycleTypes.CASE_ARRIVAL:
                    arrivalTimes.set(event.caseId.toString(), new Date(event.timestamp));
                    break;
                case LifecycleTypes.CASE_END:
                    endTimes.set(event.caseId.toString(), new Date(event.timestamp));
                    break;
                default:
                    break;
            }
        }

        const redisKeyFrames = REDIS_KEY_PREFIX_FRAMES + processId
        const frameCache = await redis.get(redisKeyFrames);

        if (frameCache) {
            const frames: Array<FrameCase> = JSON.parse(frameCache);
            for (const frame of frames) {
                const key = frame.caseId.toString();
                if (!arrivalTimes.has(key)) {
                    arrivalTimes.set(key, new Date(process.startDate));
                }
            }
        } else {
            const frames = await appDataSource.getRepository(Frame).find({ where: { processId } });
            for (const frame of frames) {
                const key = frame.caseId.toString();
                if (!arrivalTimes.has(key)) {
                    arrivalTimes.set(key, new Date(process.startDate));
                }
            }
        }

        const start = new Date(process.startDate);
        const end = new Date(process.endDate);
        const totalDuration = end.getTime() - start.getTime();
        const step = totalDuration / 1000;

        const changes: Array<{ timestamp: number; effect: number }> = [];

        arrivalTimes.forEach((date) => changes.push({ timestamp: date.getTime(), effect: +1 }));
        endTimes.forEach((date) => changes.push({ timestamp: date.getTime(), effect: -1 }));
        changes.sort((a, b) => a.timestamp - b.timestamp);

        const result: Array<number> = [];
        let activeCount = 0;
        let index = 0;

        for (let i = 0; i < 1000; i++) {
            const point = start.getTime() + i * step;
            while (index < changes.length && changes[index].timestamp <= point) {
                activeCount += changes[index].effect;
                index++;
            }
            result.push(activeCount);
        }

        await redis.set(redisKeyWorkload, JSON.stringify(result), 'EX', 60 * 60 * 24);
        redis.disconnect();

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to get workload data." }, { status: 500 });
    }
}
