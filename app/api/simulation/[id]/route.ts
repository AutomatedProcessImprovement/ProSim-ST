import {NextResponse} from "next/server";
import {getRedisInstance} from "@database/redis";
import {join} from "path";
import {readFile} from "fs/promises";

export const GET = async (request, {params}) => {
    const mockDataFilePath = join(process.cwd(), 'assets/jsons/nested-complex-parallel-entire-case-with_token_id.json'); // ToDo: to be removed

    try {
        const redis = getRedisInstance();
        let simulation = await redis.get(params.id);
        simulation = JSON.parse(simulation);

        const filePath = join(process.cwd(), 'public/assets', simulation.fileName);
        const file = await readFile(filePath);

        redis.disconnect();

        const mockContent = await readFile(mockDataFilePath, 'utf8'); // ToDo: to be removed
        const mockData = JSON.parse(mockContent); // ToDo: to be removed

        return NextResponse.json({
            simulationData: mockData, // ToDo: simulation.data,
            configData: { ...simulation.data },
            file
        }, { status: 200 });
    } catch (e) {
        console.log(e)
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}
