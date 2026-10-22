import Redis from "ioredis";
import {DataSource} from "typeorm";
import {Frame} from "@db/entities/Frame";
import {REDIS_KEY_PREFIX_FRAMES} from "@db/redis/redis";
import {FrameCase} from "@definitions/simulation/types";

type FrameRow = {
    caseId: number | string;
    activeElements: Record<string, string> | string;
    arrivalTime: string | null;
};

// "2024-01-01 08:00:00" (UTC, as stored) -> "2024-01-01T08:00:00.000Z"
const storedToIso = (value: string | null): string | null => {
    if (!value) return null;
    const date = new Date(value.trim().replace(" ", "T") + "Z");
    return isNaN(date.getTime()) ? null : date.toISOString();
};

// The cases open at the starting point of a simulation: from the cache, or else from the database (and then cached
// again for a day)
export const loadInitialFrames = async (redis: Redis, dataSource: DataSource, processId: string): Promise<FrameCase[]> => {
    const redisKey = REDIS_KEY_PREFIX_FRAMES + processId;
    const cached = await redis.get(redisKey);
    if (cached) return JSON.parse(cached) as FrameCase[];

    const rows: FrameRow[] = await dataSource.getRepository(Frame)
        .createQueryBuilder("frame")
        .select([
            "frame.caseId AS caseId",
            "frame.activeElements AS activeElements",
            "CAST(frame.arrivalTime AS CHAR) AS arrivalTime",
        ])
        .where("frame.processId = :processId", { processId })
        .getRawMany();

    const frames: FrameCase[] = rows.map(row => {
        const arrivalTime = storedToIso(row.arrivalTime);
        return {
            caseId: Number(row.caseId),
            activeElements: typeof row.activeElements === "string" ? JSON.parse(row.activeElements) : row.activeElements,
            ...(arrivalTime ? {arrivalTime} : {}),
        };
    });

    await redis.set(redisKey, JSON.stringify(frames), 'EX', 60 * 60 * 24);
    return frames;
};
