import {getRedisInstance} from "@database/redis";
import {NextResponse} from "next/server";
import {writeFile} from "fs/promises";
import path from "path";
import {existsSync, mkdirSync} from "fs";
import axios from "axios";
import {AlgorithmConfiguration} from "@definitions/config/interfaces";
import {calculateEndDate} from "@utils/dateHelpers";
import {Batch, BatchEvent} from "@definitions/simulation/types";

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

const getSimulationData = async (body: FormData) => {
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
        process.env.PYTHON_MICROSERVICE_BASE_URL + "/start-simulation",
        reqBody,
        { headers: { "Content-Type": "multipart/form-data" } }
    )
    const groupedEvents = groupEvents(response.data.events);

    return {
        id: body.get('id'),
        data: {
            frames: response.data.frames,
            events: groupedEvents,
        },
    };
}

const groupEvents = (events: Array<BatchEvent>): Array<Batch> => {
    const sortedEvents = [...events].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const endTimestamp = sortedEvents[sortedEvents.length - 1].timestamp;
    const batches = generateEmptyBatches(sortedEvents[0].timestamp, endTimestamp);

    let batchIndex = 0;
    for (const event of sortedEvents) {
        const eventDate = new Date(event.timestamp);
        if (event.timestamp === endTimestamp) batchIndex = batches.length - 1;
        else while (eventDate >= new Date(batches[batchIndex].endDate)) {
            batchIndex++;
        }
        batches[batchIndex].events.push(event);
    }

    return batches;
}

const generateEmptyBatches = (startDate: string, endDate: string): Array<Batch> => {
    const emptyBatches: Array<Batch> = [];

    const start = new Date(startDate);
    const end = new Date(endDate);

    start.setMinutes(0, 0, 0);
    if (start < new Date(startDate)) {
        let nextHour = new Date(start);
        nextHour.setHours(nextHour.getHours() + 1);
        emptyBatches.push({
            startDate: startDate,
            endDate: nextHour.toISOString(),
            events: []
        });

        start.setHours(start.getHours() + 1);
    }

    while (start < end) {
        let nextHour = new Date(start);
        nextHour.setHours(nextHour.getHours() + 1);

        emptyBatches.push({
            startDate: start.toISOString(),
            endDate: nextHour.toISOString(),
            events: []
        });

        start.setHours(start.getHours() + 1);
    }

    if (new Date(emptyBatches[emptyBatches.length - 1].endDate) > end) {
        emptyBatches[emptyBatches.length - 1].endDate = endDate;
    }

    return emptyBatches;
}
