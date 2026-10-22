import {getRedisInstance, REDIS_KEY_PREFIX_FRAMES} from "@db/redis/redis";
import {NextResponse} from "next/server";
import {writeFile} from "fs/promises";
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

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const POST = async (request) => {
    try {
        const body = await request.formData();

        const file = body.get("bpmnFile");
        if (!file) {
            return NextResponse.json({ error: "No files received." }, { status: 400 });
        }
        // The id names files here and in the Python service, so it must not contain path characters
        const id = body.get("id");
        if (typeof id !== "string" || !ID_PATTERN.test(id)) {
            return NextResponse.json({ error: "Invalid simulation id." }, { status: 400 });
        }

        const dir = path.join(process.cwd(), "public/assets");
        if (!existsSync(dir)){
            mkdirSync(dir, { recursive: true });
        }

        const simulationData = await getSimulationData(body);

        // Keep the upload inside public/assets and always serve it as .bpmn, never as HTML/XML/JS
        const baseName = path.basename(file.name).replace(/[^A-Za-z0-9._-]/g, "_").replace(/\.bpmn$/i, "");
        const fileName = `${simulationData.id}_${baseName}.bpmn`;
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(path.join(dir, fileName), buffer);

        await insertSimulationData(simulationData, fileName);

        const redis = getRedisInstance();
        const redisKey = REDIS_KEY_PREFIX_FRAMES + simulationData.id;
        await redis.set(redisKey, JSON.stringify(simulationData.data.frames), 'EX', 60*60*24);
        redis.disconnect();

        return NextResponse.json({ id: simulationData.id }, { status: 201 });
    } catch (error) {
        console.log(error);
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}

const getSimulationData = async (body: FormData): Promise<SimulationSeedData> => {
    const configInput: AlgorithmConfiguration = JSON.parse(body.get('config') as string);
    // The starting point is wall-clock time in the log's time zone; the horizon is added to it the same way
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
    // The simulator finishes every case that arrived before the horizon, so it reports events after it; the
    // simulation only covers the configured window
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

        // Normally no event precedes the starting point; if one does, the timeline still has to include it
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
        // A bulk INSERT with no rows is invalid SQL, e.g. no cases are in progress at the starting point
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
