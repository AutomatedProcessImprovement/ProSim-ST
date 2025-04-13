import {getRedisInstance} from "@db/redis/redis";
import {NextResponse} from "next/server";
import {writeFile} from "fs/promises";
import path from "path";
import {existsSync, mkdirSync} from "fs";
import axios from "axios";
import {AlgorithmConfiguration} from "@definitions/config/interfaces";
import {calculateEndDate} from "@utils/dateHelpers";
import {PySimulationData} from "@definitions/api/types";
import { Event } from "@db/entities/Event";
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
        await insertSimulationData(simulationData);

        const fileName = `${simulationData.id}_${file.name.replaceAll(" ", "_")}`;
        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(path.join(dir, fileName), buffer);

        const redis = getRedisInstance();
        await redis.set(simulationData.id as string, JSON.stringify({
            frames: simulationData.data.frames,
            fileName
        }), 'EX', 60*60*24);

        redis.disconnect();

        return NextResponse.json({ id: simulationData.id }, { status: 201 });
    } catch (error) {
        console.log(error);
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}

const getSimulationData = async (body: FormData): Promise<PySimulationData> => {
    const configInput: AlgorithmConfiguration = JSON.parse(body.get('config') as string);
    const startDate = new Date(configInput.starting_point + "Z").toISOString();
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

    return {
        id: body.get('id') as string,
        data: response.data,
    };
}

const insertSimulationData = async (data: PySimulationData) => {
    const { id: processId, data: { events } } = data;

    const appDataSource = await createMySQLConnection();
    const queryRunner = appDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const values: any[] = events.map(event => [
            event.case_id,
            event.lifecycle,
            new Date(event.timestamp).toISOString().slice(0, 19).replace("T", " "),
            event.node_id,
            JSON.stringify(event.paths),
            processId
        ]);

        const placeholders = values.map(() => `(?, ?, ?, ?, ?, ?)`).join(", ");

        const sql = `
            INSERT INTO event (caseId, lifecycle, timestamp, nodeId, paths, processId)
            VALUES ${placeholders};
        `;

        const flattenedValues = values.flat();

        await queryRunner.query(sql, flattenedValues);
        await queryRunner.commitTransaction();
    } catch (err) {
        console.error("Bulk insert error:", err);
        await queryRunner.rollbackTransaction();
    } finally {
        await queryRunner.release();
    }
}
