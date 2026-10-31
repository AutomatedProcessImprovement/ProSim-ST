import {Batch, BatchEvent, FrameCase, WTPTState} from "@definitions/simulation/types";
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
}

export const mapPyFrameCase = (frame: PyFrameCase): FrameCase => {
    const arrival = frame.arrival_time ? new Date(frame.arrival_time) : null;
    const known = arrival !== null && !isNaN(arrival.getTime());
    return {
        caseId: frame.case_id,
        activeElements: frame.active_elements,
        ...(known ? {arrivalTime: arrival.toISOString()} : {}),
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
    caseArrivals: Record<string, number>;
    openAtStart: number;
    openAtStartFinished: number;
    openAtEnd: number;
    arrived: number;
    completed: number;
    averageCycleTimeMs: number | null;
}

export type ResumeSimulationRequestBodyPython = {
    process_id: string;
    timestamp: string;
}

export type ResumeSimulationResponse = {
    frames: Array<FrameCase>,
    batches: Array<Batch>,
    pointer: number,
    finishedCasesNumber: number,
    wtpt: WTPTState;
}
