import {NextResponse} from "next/server";
import {getRedisInstance, REDIS_KEY_PREFIX_FRAMES, REDIS_KEY_PREFIX_WORKLOAD} from "@db/redis/redis";
import {Workload} from "@definitions/api/types";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {Frame} from "@db/entities/Frame";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {FrameCase} from "@definitions/simulation/types";

export const GET = async (
    request: Request,
    context: { params: { id: string } }
): Promise<NextResponse<Workload | {error: string}>> => {
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
                const key = frame.case_id.toString();
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

        const workload: Workload = [];
        const iter = new Date(start);

        while (iter < end) {
            const batchStart = new Date(iter);
            let count = 0;
            for (const [caseId, arrival] of arrivalTimes.entries()) {
                const ended = endTimes.get(caseId);
                if (arrival <= batchStart && (!ended || ended > batchStart)) count++;
            }

            const batchStartPercent = Math.round(
                ((batchStart.getTime() - start.getTime()) / totalDuration) * 100 * 100
            ) / 100;
            workload.push({ startPercent: batchStartPercent, activeCaseCount: count });

            iter.setHours(iter.getHours() + 1);
        }

        await redis.set(redisKeyWorkload, JSON.stringify(workload), 'EX', 60 * 60 * 24);
        redis.disconnect();

        return NextResponse.json(workload, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to get workload data." }, { status: 500 });
    }
}
