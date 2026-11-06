import axios from "axios";
import {JobStatus} from "@utils/simulationJobs";

const POLL_INTERVAL_MS = 1000;
const MAX_POLL_FAILURES = 30;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const pollRun = async (
    id: string,
    onStatus: (status: JobStatus) => void,
    isActive: () => boolean,
): Promise<JobStatus | null> => {
    let failures = 0;
    while (isActive()) {
        await sleep(POLL_INTERVAL_MS);
        try {
            const {data: status} = await axios.get<JobStatus>(`/api/simulation/${id}/status`);
            failures = 0;
            if (isActive()) onStatus(status);
            if (status.stage === 'done' || status.stage === 'failed') return status;
        } catch (error) {
            if (error?.response?.status === 404 || ++failures >= MAX_POLL_FAILURES) {
                return {
                    stage: 'failed',
                    durations: {},
                    error: {
                        stage: 'queued',
                        message: error?.response?.data?.error ?? 'Lost contact with the server while the simulation was running.',
                    },
                };
            }
        }
    }
    return null;
}
