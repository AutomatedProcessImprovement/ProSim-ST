import {NextResponse} from "next/server";
import axios from "axios";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {getJob, jobStatus, JobStatus, PythonProgress} from "@utils/simulationJobs";

export const dynamic = "force-dynamic";

const NO_STORE = {"Cache-Control": "no-store"};

const fetchProgress = async (id: string): Promise<PythonProgress | null> => {
    try {
        const response = await axios.get(
            `${process.env.PYTHON_MICROSERVICE_BASE_URL}/progress/${encodeURIComponent(id)}`,
            {timeout: 5000},
        );
        return response.data;
    } catch {
        return null;
    }
};

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<JobStatus | {error: string}>> => {
    try {
        const {id} = await context.params;
        const job = getJob(id);

        if (!job) {
            const dataSource = await createMySQLConnection();
            const saved = await dataSource.getRepository(Process).count({where: {id}});
            return saved
                ? NextResponse.json({stage: "done", durations: {}}, {headers: NO_STORE})
                : NextResponse.json({error: "This simulation is not running. It may have been interrupted by a restart."}, {status: 404, headers: NO_STORE});
        }

        const progress = await fetchProgress(id);
        if (progress) job.progress = progress;
        return NextResponse.json(jobStatus(job, job.progress ?? null), {headers: NO_STORE});
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: "Failed to read the simulation status."}, {status: 500, headers: NO_STORE});
    }
}
