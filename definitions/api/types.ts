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
    file: Buffer,
    pointer: number,
}

export type SimulationSeedData = {
    id: string;
    data: {
        frames: Array<FrameCase>;
        events: Array<BatchEvent>;
    }
}

export type PollingData = {
    batches: Array<Batch>,
    pointer: number,
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
