import {NextResponse} from "next/server";
import {getRedisInstance} from "@database/redis";
import {join} from "path";
import {readFile} from "fs/promises";
import {SimulationEntry} from "@definitions/api/types";

export const GET = async (request, {params}) => {
    try {
        const redis = getRedisInstance();
        const stringSimulationData = await redis.get(params.id);
        const simulation: SimulationEntry = JSON.parse(stringSimulationData);

        const filePath = join(process.cwd(), 'public/assets', simulation.fileName);
        const file = await readFile(filePath);

        redis.disconnect();

        return NextResponse.json({
            simulationData: simulation.data,
            file
        }, { status: 200 });
    } catch (e) {
        console.log(e)
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}
