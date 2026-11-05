import {getRedisInstance, REDIS_KEY_PREFIX_FRAMES} from "@db/redis/redis";
import {NextResponse} from "next/server";
import {unlink, writeFile} from "fs/promises";
import path from "path";
import {existsSync, mkdirSync} from "fs";
import axios from "axios";
import {AlgorithmConfiguration} from "@definitions/config/interfaces";
import {calculateEndDate, logTimeToUtc} from "@utils/dateHelpers";
import {
    mapPyBatchEvent,
    mapPyFrameCase,
    PyBatchEvent,
    PyFrameCase,
    SimulationSeedData,
} from "@definitions/api/types";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {validateSimulationInputs} from "@utils/inputValidation";
import {
    activeJobCount,
    createJob,
    failJob,
    getJob,
    JobError,
    MAX_ACTIVE_JOBS,
    setJobStage,
    SIMULATION_STAGES,
} from "@utils/simulationJobs";

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
        const issues = validateSimulationInputs(await file.text(), jsonFile ? await jsonFile.text() : "");
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
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(path.join(dir, fileName), buffer);

        createJob(id);
        void runSimulation(id, body, path.join(dir, fileName));

        return NextResponse.json({ id }, { status: 202 });
    } catch (error) {
        console.log(error);
        return NextResponse.json({ error: "Failed to start the simulation." }, { status: 500 });
    }
}

const runSimulation = async (id: string, body: FormData, assetPath: string) => {
    let simulationData: SimulationSeedData;
    try {
        simulationData = await getSimulationData(body);
    } catch (error) {
        console.error(`Simulation ${id} failed:`, error?.response?.data ?? error?.message ?? error);
        failJob(id, simulatorError(error));
        await unlink(assetPath).catch(() => {});
        return;
    }

    setJobStage(id, "saving");
    try {
        await insertSimulationData(simulationData, path.basename(assetPath));

        const redis = getRedisInstance();
        const redisKey = REDIS_KEY_PREFIX_FRAMES + simulationData.id;
        await redis.set(redisKey, JSON.stringify(simulationData.data.frames), 'EX', 60*60*24);
        redis.disconnect();

        setJobStage(id, "done");
    } catch (error) {
        console.error(`Saving simulation ${id} failed:`, error);
        failJob(id, {stage: "saving", message: "The results could not be saved. Please try again."});
        await unlink(assetPath).catch(() => {});
    }
}

const simulatorError = (error): JobError => {
    const detail = error?.response?.data?.detail;
    if (detail && typeof detail === "object" && typeof detail.message === "string") {
        const stage = SIMULATION_STAGES.includes(detail.stage) ? detail.stage : "simulation";
        return {stage, message: detail.message};
    }
    if (typeof detail === "string") return {stage: "queued", message: detail};
    if (!error?.response) return {stage: "queued", message: "The simulator could not be reached. Please try again later."};
    return {stage: "simulation", message: `The simulator answered with status ${error.response.status}.`};
}

const getSimulationData = async (body: FormData): Promise<SimulationSeedData> => {
    const configInput: AlgorithmConfiguration = JSON.parse(body.get('config') as string);
    const utcOffset = /^[+-]\d{2}:\d{2}$/.test(configInput.utcOffset ?? "") ? configInput.utcOffset : "+00:00";
    const windowStart = logTimeToUtc(configInput.startingPoint, utcOffset);
    const windowEnd = logTimeToUtc(calculateEndDate(configInput).toISOString().slice(0, 19), utcOffset);
    const startDate = windowStart.toISOString();
    const endDate = windowEnd.toISOString();

    const reqBody = new FormData();
    reqBody.append("process_id", body.get("id"));
    reqBody.append("start_time", startDate);
    reqBody.append("simulation_horizon", endDate);
    reqBody.append("event_log", body.get("logFile"));
    reqBody.append("bpmn_model", body.get("bpmnFile"));
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

const insertSimulationData = async (
    data: SimulationSeedData,
    fileName: string,
) => {
    const { id: processId, window, data: { frames } } = data;
    const events = data.data.events.filter(event => new Date(event.timestamp) <= window.endDate);

    const appDataSource = await createMySQLConnection();
    const queryRunner = appDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const processSql = `
            INSERT INTO process (id, fileName, startDate, endDate, utcOffset)
            VALUES (?, ?, ?, ?, ?)
        `;

        let startDate = window.startDate;
        const endDate = window.endDate;
        const eventValues = events.map(event => {
            const eventDate = new Date(event.timestamp);
            if (eventDate < startDate) {
                startDate = eventDate;
            }

            return [
                event.caseId,
                event.lifecycle,
                eventDate.toISOString().slice(0, 19).replace("T", " "),
                event.nodeId,
                JSON.stringify(event.paths),
                processId,
            ]
        });

        const eventPlaceholders = eventValues.map(() => `(?, ?, ?, ?, ?, ?)`).join(", ");

        const eventSql = `
            INSERT INTO event (caseId, lifecycle, timestamp, nodeId, paths, processId)
            VALUES ${eventPlaceholders};
        `;

        const flattenedEventValues = eventValues.flat();

        const frameValues = frames.map(frame => [
            frame.caseId,
            JSON.stringify(frame.activeElements),
            frame.arrivalTime ? new Date(frame.arrivalTime).toISOString().slice(0, 19).replace("T", " ") : null,
            processId,
        ]);

        const framePlaceholders = frameValues.map(() => `(?, ?, ?, ?)`).join(", ");

        const frameSql = `
            INSERT INTO frame (caseId, activeElements, arrivalTime, processId)
            VALUES ${framePlaceholders};
        `;

        const flattenedFrameValues = frameValues.flat();

        await queryRunner.query(processSql, [
            processId,
            fileName,
            startDate.toISOString().slice(0, 19).replace("T", " "),
            endDate.toISOString().slice(0, 19).replace("T", " "),
            window.utcOffset,
        ]);
        if (eventValues.length > 0) await queryRunner.query(eventSql, flattenedEventValues);
        if (frameValues.length > 0) await queryRunner.query(frameSql, flattenedFrameValues);

        await queryRunner.commitTransaction();
    } catch (err) {
        console.error("Bulk insert error:", err);
        await queryRunner.rollbackTransaction();
        throw err;
    } finally {
        await queryRunner.release();
    }
}
