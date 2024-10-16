import {NextResponse} from "next/server";
import {getRedisInstance} from "@database/redis";
import path from "path";
import {readFile} from "fs/promises";

export const GET = async (request, {params}) => {
    try {
        const redis = getRedisInstance();
        let simulation = await redis.get(params.id);
        simulation = JSON.parse(simulation);

        const filePath = path.join(process.cwd(), 'public/assets', simulation.fileName);
        const file = await readFile(filePath);

        redis.disconnect();

        return NextResponse.json({
            simulationData: simulation.data,
            file
        }, { status: 200 });
    } catch (e) {
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}
