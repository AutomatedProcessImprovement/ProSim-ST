import {getRedisInstance} from "@db/redis/redis";
import {NextResponse} from "next/server";
import {writeFile} from "fs/promises";
import path from "path";
import {existsSync, mkdirSync} from "fs";
import axios from "axios";
import {AlgorithmConfiguration} from "@definitions/config/interfaces";
import {calculateEndDate} from "@utils/dateHelpers";
import {
    mapPyBatchEvent,
    mapPyFrameCase,
    PyBatchEvent,
    PyFrameCase,
    SimulationSeedData,
} from "@definitions/api/types";
import {createMySQLConnection} from "@db/mysql/typeorm";

export const POST = async (request) => {
    try {
        const body = await request.formData();

        const file = body.get("bpmnFile");
        if (!file) {
            return NextResponse.json({ error: "No files received." }, { status: 400 });
        }

        const dir = path.join(process.cwd(), "public/assets");
        if (!existsSync(dir)){
            mkdirSync(dir, { recursive: true });
        }

        const simulationData = await getSimulationData(body);

        const fileName = `${simulationData.id}_${file.name.replaceAll(" ", "_")}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(path.join(dir, fileName), buffer);

        await insertSimulationData(simulationData, fileName);

        const redis = getRedisInstance();
        await redis.set(simulationData.id, JSON.stringify(simulationData.data.frames), 'EX', 60*60*24);
        redis.disconnect();

        return NextResponse.json({ id: simulationData.id }, { status: 201 });
    } catch (error) {
        console.log(error);
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}

const getSimulationData = async (body: FormData): Promise<SimulationSeedData> => {
    const configInput: AlgorithmConfiguration = JSON.parse(body.get('config') as string);
    const startDate = new Date(configInput.startingPoint + "Z").toISOString();
    const endDate = calculateEndDate(configInput).toISOString()

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
    const { id: processId, data: { events, frames } } = data;

    const appDataSource = await createMySQLConnection();
    const queryRunner = appDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const processSql = `
            INSERT INTO process (id, fileName, startDate, endDate)
            VALUES (?, ?, ?, ?)
        `;

        let startDate = new Date(events[0].timestamp);
        let endDate = new Date(events[0].timestamp);
        const eventValues = events.map(event => {
            const eventDate = new Date(event.timestamp);
            if (eventDate < startDate) {
                startDate = eventDate;
            }
            if (eventDate > endDate) {
                endDate = eventDate;
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
            processId,
        ]);

        const framePlaceholders = frameValues.map(() => `(?, ?, ?)`).join(", ");

        const frameSql = `
            INSERT INTO frame (caseId, activeElements, processId)
            VALUES ${framePlaceholders};
        `;

        const flattenedFrameValues = frameValues.flat();

        await queryRunner.query(processSql, [
            processId,
            fileName,
            startDate.toISOString().slice(0, 19).replace("T", " "),
            endDate.toISOString().slice(0, 19).replace("T", " "),
        ]);
        await queryRunner.query(eventSql, flattenedEventValues);
        await queryRunner.query(frameSql, flattenedFrameValues);

        await queryRunner.commitTransaction();
    } catch (err) {
        console.error("Bulk insert error:", err);
        await queryRunner.rollbackTransaction();
    } finally {
        await queryRunner.release();
    }
}
