import {NextResponse} from "next/server";
import {readFile} from "fs/promises";
import {join} from "path";
import {getRedisInstance, REDIS_KEY_PREFIX_ANALYSIS} from "@db/redis/redis";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {loadInitialFrames} from "@db/mysql/frames";
import {ProcessAnalysis} from "@definitions/api/types";
import {AnalysisEvent, buildProcessAnalysis, readFlowTargets} from "@utils/processAnalysis";

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ProcessAnalysis | {error: string}>> => {
    try {
        const params = await context.params;
        const processId = params.id;
        const redis = getRedisInstance();
        const redisKeyAnalysis = REDIS_KEY_PREFIX_ANALYSIS + processId;

        const cachedAnalysis = await redis.get(redisKeyAnalysis);
        if (cachedAnalysis) {
            redis.disconnect();
            return NextResponse.json(JSON.parse(cachedAnalysis), { status: 200 });
        }

        const appDataSource = await createMySQLConnection();
        const simulationProcess = await appDataSource.getRepository(Process)
            .createQueryBuilder("process")
            .select([
                "process.fileName AS fileName",
                "CAST(process.startDate AS CHAR) AS startDate",
                "CAST(process.endDate AS CHAR) AS endDate",
                "process.setToDelete AS setToDelete",
            ])
            .where("process.id = :id", { id: processId })
            .getRawOne();

        if (!simulationProcess?.startDate || !simulationProcess?.endDate || simulationProcess.setToDelete) {
            redis.disconnect();
            return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }

        const events: AnalysisEvent[] = await appDataSource.query(`
            SELECT caseId, lifecycle, nodeId, CAST(timestamp AS CHAR) AS timestamp
            FROM event
            WHERE processId = ?
            ORDER BY timestamp ASC, id ASC
        `, [processId]);

        const frames = await loadInitialFrames(redis, appDataSource, processId);

        let flowTargets: Record<string, string> = {};
        try {
            const bpmnXml = await readFile(join(process.cwd(), "public/assets", simulationProcess.fileName), "utf-8");
            flowTargets = readFlowTargets(bpmnXml);
        } catch (error) {
            console.warn("Could not read the BPMN model for the analysis", error);
        }

        const result = buildProcessAnalysis(events, frames, flowTargets, simulationProcess.startDate, simulationProcess.endDate);

        await redis.set(redisKeyAnalysis, JSON.stringify(result), 'EX', 60 * 60 * 24);
        redis.disconnect();

        return NextResponse.json(result, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: "Failed to analyse the simulation." }, { status: 500 });
    }
}
