import {NextResponse} from "next/server";
import {getRedisInstance} from "@db/redis/redis";
import {join} from "path";
import {readFile} from "fs/promises";
import {GetSimulationByIdRequestBody, SimulationEntry} from "@definitions/api/types";

export const GET = async (request: Request, params: GetSimulationByIdRequestBody) => {
    try {
        const { id: processId, pointer, limit } = params;

        const redis = getRedisInstance();
        const stringFrames = await redis.get(processId);

        if (!stringFrames) {
            return NextResponse.json({ error: 'Simulation data not found' }, { status: 404 });
        }

        const simulation: SimulationEntry = JSON.parse(stringFrames);

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
