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
}

export const mapPyFrameCase = (frame: PyFrameCase): FrameCase => ({
    caseId: frame.case_id,
    activeElements: frame.active_elements,
});

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
    // The configured simulation window and the UTC offset of the uploaded log
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

// What the simulation forecasts, for the analyst: samples every stepMs from startDate
export type ProcessAnalysis = {
    startDate: string;
    endDate: string;
    stepMs: number;
    // Cases in progress at every sample
    open: number[];
    // Per task: cases waiting for it and cases being worked on at every sample
    tasks: Record<string, {waiting: number[]; inWork: number[]}>;
    // When each case arrived (ms since epoch); cases already running at the start have the start time
    caseArrivals: Record<string, number>;
    openAtStart: number;
    openAtStartFinished: number;
    openAtEnd: number;
    arrived: number;
    completed: number;
    // Average duration of the cases that both arrived and finished within the simulation
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
