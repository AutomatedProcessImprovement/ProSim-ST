import {NextResponse} from "next/server";
import {getRedisInstance, REDIS_KEY_PREFIX_CYCLE_TIME} from "@db/redis/redis";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {buildCycleTimeSeries} from "@utils/cycleTime";

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<Array<number> | {error: string}>> => {
    try {
        const params = await context.params;
        const processId = params.id;
        const redis = getRedisInstance();
        const redisKeyCycleTime = REDIS_KEY_PREFIX_CYCLE_TIME + processId;

        const cachedCycleTimes = await redis.get(redisKeyCycleTime);
        if (cachedCycleTimes) {
            return NextResponse.json(JSON.parse(cachedCycleTimes), { status: 200 });
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

        const result = buildCycleTimeSeries(events, process.startDate, process.endDate);

        await redis.set(redisKeyCycleTime, JSON.stringify(result), 'EX', 60 * 60 * 24);
        redis.disconnect();

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to get cycle time data." }, { status: 500 });
    }
}