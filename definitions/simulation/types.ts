import {LifecycleTypes} from "@definitions/simulation/enums";

export type Tokens = {
    [key: string]: Array<SVGCircleElement>,
}

export type SimulationData = {
    frame_mockup: Array<FrameCase>,
}

export type FrameCase = {
    active_elements: Array<string>,
    case_id: string,
}

export type BatchEvent = {
    case_id: string,
    lifecycle: LifecycleTypes,
    timestamp: string,
    activity_id: string,
    flow_path: string[],
}

export type Batch = BatchEvent[];

export type EventsByCaseId = {
    [caseId: string]: BatchEvent[]
}
