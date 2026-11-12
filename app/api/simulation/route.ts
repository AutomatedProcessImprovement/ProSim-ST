import {NextResponse} from "next/server";
import {unlink, writeFile} from "fs/promises";
import path from "path";
import {existsSync, mkdirSync} from "fs";
import axios from "axios";
import {AlgorithmConfiguration} from "@definitions/config/interfaces";
import {calculateEndDate, logTimeToUtc, toOffsetIso} from "@utils/dateHelpers";
import {
    mapPyBatchEvent,
    mapPyFrameCase,
    PyBatchEvent,
    PyFrameCase,
    SimulationSeedData,
} from "@definitions/api/types";
import {normalizeTaskTypes, validateSimulationInputs} from "@utils/inputValidation";
import {activeJobCount, createJob, failJob, getJob, MAX_ACTIVE_JOBS} from "@utils/simulationJobs";
import {saveSimulation, simulatorError} from "@db/mysql/simulationStore";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const POST = async (request) => {
    try {
        const body = await request.formData();

        const file = body.get("bpmnFile");
        if (!file) {
            return NextResponse.json({ error: "No files received." }, { status: 400 });
        }
        const id = body.get("id");
        if (typeof id !== "string" || !ID_PATTERN.test(id)) {
            return NextResponse.json({ error: "Invalid simulation id." }, { status: 400 });
        }

        const jsonFile = body.get("jsonFile");
        const bpmnXml = normalizeTaskTypes(await file.text());
        const issues = validateSimulationInputs(bpmnXml, jsonFile ? await jsonFile.text() : "");
        if (issues.length) {
            return NextResponse.json({ error: "The uploaded files cannot be simulated.", issues }, { status: 400 });
        }

        const existing = getJob(id);
        if (existing && existing.stage !== "failed") {
            return NextResponse.json({ error: "This simulation is already running." }, { status: 409 });
        }
        if (activeJobCount() >= MAX_ACTIVE_JOBS) {
            return NextResponse.json(
                { error: "The simulator is busy with other runs. Please try again in a few minutes." },
                { status: 429 },
            );
        }

        const dir = path.join(process.cwd(), "public/assets");
        if (!existsSync(dir)){
            mkdirSync(dir, { recursive: true });
        }

        const baseName = path.basename(file.name).replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.bpmn$/i, "");
        const fileName = `${id}_${baseName}.bpmn`;
        await writeFile(path.join(dir, fileName), bpmnXml);

        createJob(id);
        void runSimulation(id, body, path.join(dir, fileName), new Blob([bpmnXml], {type: "application/xml"}));

        return NextResponse.json({ id }, { status: 202 });
    } catch (error) {
        console.log(error);
        return NextResponse.json({ error: "Failed to start the simulation." }, { status: 500 });
    }
}

const runSimulation = async (id: string, body: FormData, assetPath: string, bpmnModel: Blob) => {
    let simulationData: SimulationSeedData;
    try {
        simulationData = await getSimulationData(body, bpmnModel);
    } catch (error) {
        console.error(`Simulation ${id} failed:`, error?.response?.data ?? error?.message ?? error);
        failJob(id, simulatorError(error));
        await unlink(assetPath).catch(() => {});
        return;
    }

    await saveSimulation(simulationData, assetPath);
}

const getSimulationData = async (body: FormData, bpmnModel: Blob): Promise<SimulationSeedData> => {
    const configInput: AlgorithmConfiguration = JSON.parse(body.get('config') as string);
    const utcOffset = /^[+-]\d{2}:\d{2}$/.test(configInput.utcOffset ?? "") ? configInput.utcOffset : "+00:00";
    const windowStart = logTimeToUtc(configInput.startingPoint, utcOffset);
    const windowEnd = logTimeToUtc(calculateEndDate(configInput).toISOString().slice(0, 19), utcOffset);

    const reqBody = new FormData();
    reqBody.append("process_id", body.get("id"));
    reqBody.append("start_time", toOffsetIso(windowStart, utcOffset));
    reqBody.append("simulation_horizon", toOffsetIso(windowEnd, utcOffset));
    reqBody.append("event_log", body.get("logFile"));
    reqBody.append("bpmn_model", bpmnModel, (body.get("bpmnFile") as File).name);
    reqBody.append("json_parameters", body.get("jsonFile"));
    reqBody.append("column_mapping", body.get('mapping'))

    const response = await axios.post(
        process.env.PYTHON_MICROSERVICE_BASE_URL + "/start",
        reqBody,
        { headers: { "Content-Type": "multipart/form-data" } }
    );

    const pyData = response.data as { events: Array<PyBatchEvent>; frames: Array<PyFrameCase> };

    return {
        id: body.get('id') as string,
        window: { startDate: windowStart, endDate: windowEnd, utcOffset },
        data: {
            events: pyData.events.map(mapPyBatchEvent),
            frames: pyData.frames.map(mapPyFrameCase),
        },
    };
}
