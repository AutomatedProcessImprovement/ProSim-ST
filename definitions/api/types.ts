import {Batch, BatchEvent, FrameCase} from "@definitions/simulation/types";

export type SimulationData = {
    processId: string,
    frames: Array<FrameCase>,
    batches: Array<Batch>,
    file: Buffer,
}

export type PySimulationData = {
    id: string;
    data: {
        frames: Array<FrameCase>;
        events: Array<BatchEvent>;
    }
}

export type ResumeSimulationRequestBody = {
    requestedDate: string;
    finalDate: string;
}

export type ResumeSimulationRequestBodyPython = {
    process_id: string;
    timestamp: string;
}
