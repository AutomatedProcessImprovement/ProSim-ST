import {NextResponse} from "next/server";
import {timingSafeEqual} from "crypto";
import {join} from "path";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {cleanupOldProcesses, CleanupResult} from "@db/cleanup";

const isAuthorized = (request: Request) => {
    const token = process.env.CLEANUP_TOKEN;
    if (!token) return false;
    const expected = Buffer.from(`Bearer ${token}`);
    const received = Buffer.from(request.headers.get("authorization") ?? "");
    return expected.length === received.length && timingSafeEqual(expected, received);
};

export const POST = async (request: Request): Promise<NextResponse<CleanupResult | {error: string}>> => {
    if (!isAuthorized(request)) return NextResponse.json({error: "Not found"}, {status: 404});

    try {
        const dataSource = await createMySQLConnection();
        const result = await cleanupOldProcesses(dataSource, {
            retentionDays: Number(process.env.RETENTION_DAYS ?? 30),
            pythonBaseUrl: process.env.PYTHON_MICROSERVICE_BASE_URL,
            assetsDir: join(process.cwd(), "public/assets"),
        });
        console.log(`[cleanup] deleted ${result.deleted.length}, failed ${result.failed.length}, `
            + `orphan files ${result.orphanAssets.length}, orphan runs ${result.orphanRuns.length}`);
        return NextResponse.json(result, {status: result.failed.length ? 500 : 200});
    } catch (error) {
        console.error("[cleanup] failed", error);
        return NextResponse.json({error: "Cleanup failed"}, {status: 500});
    }
};
