import Redis from "ioredis";
import {DataSource} from "typeorm";
import {Frame} from "@db/entities/Frame";
import {REDIS_KEY_PREFIX_FRAMES} from "@db/redis/redis";
import {FrameCase, OpenTaskTimes} from "@definitions/simulation/types";

type FrameRow = {
    caseId: number | string;
    activeElements: Record<string, string> | string;
    arrivalTime: string | null;
    taskTimes: OpenTaskTimes | string | null;
};

const storedToIso = (value: string | null): string | null => {
    if (!value) return null;
    const date = new Date(value.trim().replace(" ", "T") + "Z");
    return isNaN(date.getTime()) ? null : date.toISOString();
};

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
            "frame.taskTimes AS taskTimes",
        ])
        .where("frame.processId = :processId", { processId })
        .getRawMany();

    const frames: FrameCase[] = rows.map(row => {
        const arrivalTime = storedToIso(row.arrivalTime);
        return {
            caseId: Number(row.caseId),
            activeElements: typeof row.activeElements === "string" ? JSON.parse(row.activeElements) : row.activeElements,
            ...(arrivalTime ? {arrivalTime} : {}),
            ...(row.taskTimes ? {taskTimes: typeof row.taskTimes === "string" ? JSON.parse(row.taskTimes) : row.taskTimes} : {}),
        };
    });

    await redis.set(redisKey, JSON.stringify(frames), 'EX', 60 * 60 * 24);
    return frames;
};
