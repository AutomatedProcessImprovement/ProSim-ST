export const SIMULATION_STAGES = ["queued", "state", "simulation", "playback", "saving"] as const;
export const SCENARIO_STAGES = ["queued", "state", "simulation", "repeats", "playback", "saving"] as const;

export type SimulationStage = typeof SCENARIO_STAGES[number];
export type JobStage = SimulationStage | "running" | "done" | "failed";

export type JobError = {stage: SimulationStage; message: string; input?: boolean};

export type SimulationJob = {
    id: string;
    stage: JobStage;
    stageStartedAt: number;
    savingSeconds?: number;
    error?: JobError;
    progress?: PythonProgress;
    updatedAt: number;
};

export type JobStatus = {
    stage: SimulationStage | "done" | "failed";
    durations: Partial<Record<SimulationStage, number>>;
    error?: JobError;
};

export const MAX_ACTIVE_JOBS = 3;
const JOB_TTL_MS = 60 * 60 * 1000;

const registry = globalThis as typeof globalThis & {__prosimJobs?: Map<string, SimulationJob>};
const jobs = registry.__prosimJobs ??= new Map<string, SimulationJob>();

const isActive = (job: SimulationJob) => job.stage !== "done" && job.stage !== "failed";

const dropStale = (now: number) => {
    for (const [id, job] of jobs) {
        if (!isActive(job) && now - job.updatedAt > JOB_TTL_MS) jobs.delete(id);
    }
};

export const getJob = (id: string) => jobs.get(id);

export const activeJobCount = () => [...jobs.values()].filter(isActive).length;

export const createJob = (id: string, now = Date.now()): SimulationJob => {
    dropStale(now);
    const job: SimulationJob = {id, stage: "running", stageStartedAt: now, updatedAt: now};
    jobs.set(id, job);
    return job;
};

export const setJobStage = (id: string, stage: JobStage, now = Date.now()) => {
    const job = jobs.get(id);
    if (!job) return;
    if (job.stage === "saving") job.savingSeconds = (now - job.stageStartedAt) / 1000;
    job.stage = stage;
    job.stageStartedAt = now;
    job.updatedAt = now;
};

export const failJob = (id: string, error: JobError, now = Date.now()) => {
    setJobStage(id, "failed", now);
    const job = jobs.get(id);
    if (job) job.error = error;
};

export const removeJob = (id: string) => jobs.delete(id);

export type PythonProgress = {stage: string; error?: string | null; durations?: Record<string, number>};

const PYTHON_STAGES = new Set<string>(["queued", "state", "simulation", "repeats", "playback"]);

export const jobStatus = (job: SimulationJob, progress: PythonProgress | null, now = Date.now()): JobStatus => {
    const durations: JobStatus["durations"] = {};
    for (const [stage, seconds] of Object.entries(progress?.durations ?? {})) {
        if (PYTHON_STAGES.has(stage)) durations[stage as SimulationStage] = seconds;
    }

    if (job.stage === "saving") durations.saving = (now - job.stageStartedAt) / 1000;
    else if (job.savingSeconds !== undefined) durations.saving = job.savingSeconds;

    if (job.stage === "running") {
        const stage = progress && PYTHON_STAGES.has(progress.stage) ? progress.stage as SimulationStage
            : progress?.stage === "done" ? "saving" : "queued";
        return {stage, durations};
    }
    return {stage: job.stage as JobStatus["stage"], durations, ...(job.error && {error: job.error})};
};
