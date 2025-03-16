import {getRedisInstance} from "@database/redis";
import {NextResponse} from "next/server";
import {writeFile} from "fs/promises";
import path from "path";
import {existsSync, mkdirSync} from "fs";
import axios from "axios";
import {AlgorithmConfiguration} from "@definitions/config/interfaces";
import {calculateEndDate} from "@utils/dateHelpers";
import {SimulationData} from "@definitions/api/types";
import {groupEvents} from "@utils/events";

export const POST = async (request) => {
    try {
        const body = await request.formData();
        const simulationData = await getSimulationData(body);

        const file = body.get("bpmnFile");
        if (!file) {
            return NextResponse.json({ error: "No files received." }, { status: 400 });
        }

        const dir = path.join(process.cwd(), "public/assets");
        if (!existsSync(dir)){
            mkdirSync(dir, { recursive: true });
        }

        const fileName = `${simulationData.id}_${file.name.replaceAll(" ", "_")}`;

        const buffer = Buffer.from(await file.arrayBuffer());
        await writeFile(path.join(dir, fileName), buffer);

        const redis = getRedisInstance();
        await redis.set(simulationData.id as string, JSON.stringify({
            data: simulationData.data,
            fileName
        }), 'EX', 60*60*24);

        redis.disconnect();

        return NextResponse.json({ id: simulationData.id }, { status: 201 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}

const getSimulationData = async (body: FormData): Promise<{
    id: string;
    data: SimulationData;
}> => {
    const configInput: AlgorithmConfiguration = JSON.parse(body.get('config') as string);

    const reqBody = new FormData();
    reqBody.append("process_id", body.get("id"));
    reqBody.append("start_time", new Date(configInput.starting_point + "Z").toISOString());
    reqBody.append("simulation_horizon", calculateEndDate(configInput).toISOString());
    reqBody.append("event_log", body.get("logFile"));
    reqBody.append("bpmn_model", body.get("bpmnFile"));
    reqBody.append("json_parameters", body.get("jsonFile"));
    reqBody.append("column_mapping", body.get('mapping'))

    const response = await axios.post(
        process.env.PYTHON_MICROSERVICE_BASE_URL + "/start",
        reqBody,
        { headers: { "Content-Type": "multipart/form-data" } }
    )
    const groupedEvents = groupEvents(response.data.events);

    return {
        id: body.get('id') as string,
        data: {
            frames: response.data.frames,
            batches: groupedEvents,
        },
    };
}
