import {Batch, FrameCase} from "@definitions/simulation/types";

export type SimulationEntry = {
    fileName: string;
    data: SimulationData;
}

export type SimulationData = {
    frames: Array<FrameCase>,
    batches: Array<Batch>
}

export type ResumeSimulationRequestBody = {
    requestedDate: string;
    finalDate: string;
}

export type ResumeSimulationRequestBodyPython = {
    process_id: string;
    timestamp: string;
}
