import {NextResponse} from "next/server";
import axios from "axios";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {getRedisInstance} from "@db/redis/redis";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 3000;

const passes = async (check: () => Promise<unknown>) => {
    let timer: NodeJS.Timeout;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), TIMEOUT_MS); });
    try {
        await Promise.race([check(), timeout]);
        return true;
    } catch {
        return false;
    } finally {
        clearTimeout(timer);
    }
};

export const GET = async () => {
    const redis = getRedisInstance();
    const [database, cache, simulator] = await Promise.all([
        passes(async () => (await createMySQLConnection()).query("SELECT 1")),
        passes(() => redis.ping()),
        passes(() => axios.get(`${process.env.PYTHON_MICROSERVICE_BASE_URL}/health`, {timeout: TIMEOUT_MS})),
    ]);
    redis.disconnect();

    const healthy = database && cache && simulator;
    return NextResponse.json(
        {status: healthy ? "ok" : "degraded", checks: {database, cache, simulator}},
        {status: healthy ? 200 : 503, headers: {"Cache-Control": "no-store"}},
    );
};
