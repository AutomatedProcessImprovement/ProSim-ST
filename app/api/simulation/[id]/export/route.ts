import {NextResponse} from "next/server";
import axios from "axios";
import {readFile} from "fs/promises";
import {join} from "path";
import {getRedisInstance} from "@db/redis/redis";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {loadInitialFrames} from "@db/mysql/frames";
import {buildActivitiesCsv, buildLogCsv} from "@utils/activityExport";
import {AnalysisEvent, buildProcessAnalysis, readFlowTargets, readTaskNames} from "@utils/processAnalysis";
import {buildWTPTState} from "@utils/wtpt";
import {LifecycleTypes} from "@definitions/simulation/enums";

const fileResponse = (body: string, fileName: string, contentType: string) => new NextResponse(body, {
    status: 200,
    headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${fileName}"`,
    },
});

const csvResponse = (csv: string, fileName: string) => fileResponse(csv, fileName, "text/csv; charset=utf-8");

const EXPORT_TYPES = ["log", "activities", "model", "parameters"];

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
    try {
        const {id: processId} = await context.params;
        const type = new URL(request.url).searchParams.get("type");
        if (!type || !EXPORT_TYPES.includes(type)) {
            return NextResponse.json({ error: "Unknown export" }, { status: 400 });
        }

        const appDataSource = await createMySQLConnection();
        const simulationProcess = await appDataSource.getRepository(Process)
            .createQueryBuilder("process")
            .select([
                "process.fileName AS fileName",
                "CAST(process.startDate AS CHAR) AS startDate",
                "CAST(process.endDate AS CHAR) AS endDate",
                "process.utcOffset AS utcOffset",
                "process.setToDelete AS setToDelete",
            ])
            .where("process.id = :id", { id: processId })
            .getRawOne();

        if (!simulationProcess?.startDate || !simulationProcess?.endDate || simulationProcess.setToDelete) {
            return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }

        const shortId = processId.slice(0, 8).replace(/[^\w-]/g, "");

        if (type === "parameters") {
            const {data} = await axios.get(`${process.env.PYTHON_MICROSERVICE_BASE_URL}/parameters/${encodeURIComponent(processId)}`);
            return fileResponse(JSON.stringify(data, null, 2), `simulation-parameters-${shortId}.json`, "application/json");
        }

        const events: AnalysisEvent[] = type === "model" ? [] : await appDataSource.query(`
            SELECT caseId, lifecycle, nodeId, CAST(timestamp AS CHAR) AS timestamp
            FROM event
            WHERE processId = ?
            ORDER BY timestamp ASC, FIELD(lifecycle, 'ENABLE', 'START', 'COMPLETE') ASC, id ASC
        `, [processId]);

        let bpmnXml = "";
        try {
            bpmnXml = await readFile(join(process.cwd(), "public/assets", simulationProcess.fileName), "utf-8");
        } catch (error) {
            console.warn("Could not read the BPMN model for the export", error);
        }
        if (type === "model") {
            if (!bpmnXml) return NextResponse.json({ error: "Process not found" }, { status: 404 });
            return fileResponse(bpmnXml, `process-model-${shortId}.bpmn`, "application/xml");
        }

        const taskNames = readTaskNames(bpmnXml);

        if (type === "log") {
            return csvResponse(buildLogCsv(events, taskNames, simulationProcess.utcOffset ?? "+00:00"), `simulated-log-${shortId}.csv`);
        }

        const redis = getRedisInstance();
        const frames = await loadInitialFrames(redis, appDataSource, processId);
        redis.disconnect();

        const analysis = buildProcessAnalysis(events, frames, readFlowTargets(bpmnXml), simulationProcess.startDate, simulationProcess.endDate);
        const taskEvents = events.filter(event =>
            event.lifecycle === LifecycleTypes.ENABLE || event.lifecycle === LifecycleTypes.START || event.lifecycle === LifecycleTypes.COMPLETE);
        const wtpt = buildWTPTState(taskEvents as Parameters<typeof buildWTPTState>[0]);

        return csvResponse(buildActivitiesCsv(wtpt, analysis.tasks, taskNames), `activity-statistics-${shortId}.csv`);
    } catch (e) {
        if (e?.response?.status === 404) return NextResponse.json({ error: "Process not found" }, { status: 404 });
        console.error(e);
        return NextResponse.json({ error: "Failed to export the simulation." }, { status: 500 });
    }
}
