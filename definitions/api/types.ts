import {Batch, BatchEvent, FrameCase, OpenTaskTimes, WTPTState} from "@definitions/simulation/types";
import {LifecycleTypes} from "@definitions/simulation/enums";

export type PyBatchEvent = {
    case_id: number,
    lifecycle: string,
    timestamp: string,
    node_id: string,
    paths: {
        [tokenId: string]: Array<string>,
    },
}

export const mapPyBatchEvent = (event: PyBatchEvent): BatchEvent => ({
    caseId: event.case_id,
    lifecycle: event.lifecycle as LifecycleTypes,
    timestamp: event.timestamp,
    nodeId: event.node_id,
    paths: event.paths,
});

export type PyFrameCase = {
    case_id: number,
    active_elements: {
        [tokenId: string]: string,
    },
    arrival_time?: string | null,
    task_times?: Record<string, {enabled: string; started: string | null}>,
}

const mapPyTaskTimes = (taskTimes: PyFrameCase["task_times"]): OpenTaskTimes =>
    Object.fromEntries(Object.entries(taskTimes).map(([taskId, {enabled, started}]) =>
        [taskId, {enabled: new Date(enabled).getTime(), started: started ? new Date(started).getTime() : null}]));

export const mapPyFrameCase = (frame: PyFrameCase): FrameCase => {
    const arrival = frame.arrival_time ? new Date(frame.arrival_time) : null;
    const known = arrival !== null && !isNaN(arrival.getTime());
    return {
        caseId: frame.case_id,
        activeElements: frame.active_elements,
        ...(known ? {arrivalTime: arrival.toISOString()} : {}),
        ...(frame.task_times && Object.keys(frame.task_times).length ? {taskTimes: mapPyTaskTimes(frame.task_times)} : {}),
    };
};

export type SimulationData = {
    processId: string,
    frames: Array<FrameCase>,
    batches: Array<Batch>,
    startDate: string,
    endDate: string,
    utcOffset?: string | null,
    file: Buffer,
    pointer: number,
    scenario?: ScenarioLink | null,
}

export type ScenarioEdits = {
    pools: Record<string, number>;
    arrivalPercent: number;
    tasks: Record<string, number>;
    emptyStart?: boolean;
}

export type RunDetails = {
    seed: number;
    files: {log: string; bpmn: string; parameters: string} | null;
    stateSeconds: number | null;
    simulationSeconds: number | null;
    renumberedCases?: boolean;
}

export type ScenarioLink = {
    baseProcessId: string;
    label: string;
    edits: ScenarioEdits;
}

export type WhatIfOptions = {
    baseProcessId: string;
    supported: boolean;
    editablePools: boolean;
    pools: Array<{id: string; name: string; size: number}>;
    tasks: Array<{id: string; name: string}>;
    scenarios: Array<{id: string; label: string}>;
}

export type TaskSummary = {
    count: number;
    waitMs: number | null;
    queueAverage: number;
    queuePeak: number;
    queue: number[];
}

export type RunSummary = {
    startDate: string;
    endDate: string;
    stepMs: number;
    arrived: number;
    finished: number;
    openAtEnd: number;
    cycleMs: number | null;
    waitMs: number | null;
    queueAverage: number;
    queuePeak: number;
    waitingAtEnd: number;
    queue: number[];
    tasks: Record<string, TaskSummary>;
}

export type SeedChange = {mean: number | null; low: number | null; high: number | null}

export type PoolSummary = {id: string; name: string; size: number; utilization: number | null}

export type Comparison = {
    asIs: RunSummary;
    toBe: RunSummary;
    poolsAsIs: PoolSummary[];
    poolsToBe: PoolSummary[];
    repeats: {
        seeds: number;
        changes: Record<"waitMs" | "queueAverage" | "cycleMs" | "finished", SeedChange>;
        tasks: Record<string, Record<"waitMs" | "queueAverage", SeedChange>>;
    };
}

export type ComparisonResponse = ScenarioLink & {
    processId: string;
    utcOffset: string;
    comparison: Comparison;
}

export type ResourcePool = {
    id: string;
    name: string;
    size: number;
    utilization: number | null;
    busy: number[];
    idle: number[];
    resources: Array<{name: string; utilization: number | null}>;
}

export type ResourceTimeline = {
    startDate: string;
    endDate: string;
    stepMs: number;
    calendarsKnown: boolean;
    pools: ResourcePool[];
}

export type SimulationSeedData = {
    id: string;
    window: {
        startDate: Date;
        endDate: Date;
        utcOffset: string;
    };
    data: {
        frames: Array<FrameCase>;
        events: Array<BatchEvent>;
    }
}

export type PollingData = {
    batches: Array<Batch>,
    pointer: number,
}

export type ProcessAnalysis = {
    startDate: string;
    endDate: string;
    stepMs: number;
    open: number[];
    tasks: Record<string, {waiting: number[]; inWork: number[]}>;
    startTasks: Record<string, {waiting: number; inWork: number}>;
    caseArrivals: Record<string, number>;
    openAtStart: number;
    openAtStartFinished: number;
    openAtEnd: number;
    arrived: number;
    completed: number;
    averageCycleTimeMs: number | null;
}

export type ResumeSimulationResponse = {
    frames: Array<FrameCase>,
    batches: Array<Batch>,
    pointer: number,
    finishedCasesNumber: number,
    wtpt: WTPTState;
}
