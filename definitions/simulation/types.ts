import {LifecycleTypes} from "@definitions/simulation/enums";
import {Waypoint} from "@definitions/simulation/interfaces";

export type Token = SVGCircleElement

export type Tokens = {
    [caseId: string]: {
        [tokenId: string]: Token,
    },
}

export type TokenColors = {
    [caseId: string]: {
        [tokenId: string]: string,
    },
}

export type SimulationData = {
    frame_mockup: Array<FrameCase>,
    deltas_mockup: Array<Batch>
}

export type FrameCase = {
    case_id: string,
    active_elements: {
        [tokenId: string]: string,
    },
}

export type BatchEvent = {
    case_id: string,
    lifecycle: LifecycleTypes,
    timestamp: string,
    node_id: string,
    paths: {
        [tokenId: string]: Array<string>,
    },
}

export type Batch = {
    start_date: string
    end_date: string
    events: Array<BatchEvent>
};

export type EventsByCaseId = {
    [caseId: string]: Array<BatchEvent>,
}

export type AnimationData = {
    [tokenId: string]: {
        path: Array<Waypoint>,
        onComplete?: () => void,
        nextTokenIds?: Array<string>,
    },
};

export type PathMap = {
    [tokenId: string]: {
        path: Array<Waypoint>,
        subPaths: PathMap;
        longestSubPathLength?: number;
        onComplete: () => void,
    };
};

export type TokenProgresses = {
    [caseId: string]: {
        [tokenId: string]: number,
    },
}
