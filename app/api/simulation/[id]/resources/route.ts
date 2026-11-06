import {NextResponse} from "next/server";
import axios from "axios";
import {getRedisInstance, REDIS_KEY_PREFIX_RESOURCES} from "@db/redis/redis";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {ResourceTimeline} from "@definitions/api/types";

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ResourceTimeline | {error: string}>> => {
    const redis = getRedisInstance();
    try {
        const {id} = await context.params;
        const redisKey = REDIS_KEY_PREFIX_RESOURCES + id;
        const cached = await redis.get(redisKey);
        if (cached) return NextResponse.json(JSON.parse(cached));

        const dataSource = await createMySQLConnection();
        const run = await dataSource.getRepository(Process).createQueryBuilder("process")
            .select([
                "CAST(process.startDate AS CHAR) AS startDate",
                "CAST(process.endDate AS CHAR) AS endDate",
                "process.setToDelete AS setToDelete",
            ])
            .where("process.id = :id", {id})
            .getRawOne();
        if (!run?.startDate || run.setToDelete) return NextResponse.json({error: "Process not found"}, {status: 404});

        const {data} = await axios.get<ResourceTimeline>(
            `${process.env.PYTHON_MICROSERVICE_BASE_URL}/resources/${encodeURIComponent(id)}`,
            {params: {start: `${run.startDate.replace(" ", "T")}Z`, end: `${run.endDate.replace(" ", "T")}Z`}},
        );
        await redis.set(redisKey, JSON.stringify(data), 'EX', 60 * 60 * 24);
        return NextResponse.json(data);
    } catch (error) {
        if (error?.response?.status === 404) {
            return NextResponse.json({error: "The simulator no longer has this run."}, {status: 404});
        }
        console.error(error);
        return NextResponse.json({error: "Failed to load the resources."}, {status: 500});
    } finally {
        redis.disconnect();
    }
}
