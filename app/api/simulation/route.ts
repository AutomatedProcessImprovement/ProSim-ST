import {getRedisInstance} from "@database/redis";
import {NextResponse} from "next/server";
import {writeFile} from "fs/promises";
import path from "path";
import {existsSync, mkdirSync} from "fs";

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
        await redis.set(simulationData.id, JSON.stringify({
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
    // Send request to the Python service

    return {
        id: body.get('id'),
        data: {
            // TODO: return the simulation data here
        },
    };
}
