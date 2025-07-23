import {Batch, BatchEvent, FrameCase} from "@definitions/simulation/types";

export type SimulationData = {
    processId: string,
    frames: Array<FrameCase>,
    batches: Array<Batch>,
    startDate: string,
    endDate: string,
    file: Buffer,
    pointer: number,
}

export type PySimulationData = {
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
}
