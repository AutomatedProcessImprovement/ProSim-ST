import {Batch, FrameCase} from "@definitions/simulation/types";

export type SimulationEntry = {
    fileName: string;
    data: SimulationData;
}

export type SimulationData = {
    frames: Array<FrameCase>,
    batches: Array<Batch>
}
