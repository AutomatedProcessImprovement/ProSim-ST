import {NextResponse} from "next/server";
import {getRedisInstance, REDIS_KEY_PREFIX_CYCLE_TIME} from "@db/redis/redis";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {LifecycleTypes} from "@definitions/simulation/enums";

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

        const arrivalTimes = new Map<string, number>();
        const endTimes = new Map<string, number>();

        for (const event of events) {
            const key = event.caseId.toString();
            const timestamp = new Date(event.timestamp).getTime();

            if (event.lifecycle === LifecycleTypes.CASE_ARRIVAL) {
                if (!arrivalTimes.has(key) || timestamp < (arrivalTimes.get(key) as number)) {
                    arrivalTimes.set(key, timestamp);
                }
            } else if (event.lifecycle === LifecycleTypes.CASE_END) {
                if (!endTimes.has(key) || timestamp < (endTimes.get(key) as number)) {
                    endTimes.set(key, timestamp);
                }
            }
        }

        const completedCTs: Array<{ endTs: number; cycleMs: number }> = [];
        endTimes.forEach((endTs, caseId) => {
            const arrivalTs = arrivalTimes.get(caseId);
            if (arrivalTs === undefined) return;

            const cycleMs = endTs - arrivalTs;
            if (cycleMs < 0) return;

            completedCTs.push({ endTs, cycleMs });
        });
        completedCTs.sort((a, b) => a.endTs - b.endTs);

        const start = new Date(process.startDate).getTime();
        const end = new Date(process.endDate).getTime();

        const totalDuration = end - start;
        if (totalDuration <= 0) {
            return NextResponse.json(
                { error: "Invalid process start/end dates." },
                { status: 400 }
            );
        }

        const STEPS = 100;
        const step = totalDuration / (STEPS - 1);

        const result: Array<number> = [];
        let index = 0;
        let sumCycleMs = 0;
        let count = 0;

        for (let i = 0; i < STEPS; i++) {
            const point = start + i * step;

            while (index < completedCTs.length && completedCTs[index].endTs <= point) {
                sumCycleMs += completedCTs[index].cycleMs;
                count++;
                index++;
            }

            result.push(count === 0 ? 0 : sumCycleMs / count);
        }

        await redis.set(redisKeyCycleTime, JSON.stringify(result), 'EX', 60 * 60 * 24);
        redis.disconnect();

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to get cycle time data." }, { status: 500 });
    }
}