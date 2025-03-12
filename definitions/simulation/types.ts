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
    frames: Array<FrameCase>,
    batches: Array<Batch>
}

export type FrameCase = {
    caseId: string,
    activeElements: {
        [tokenId: string]: string,
    },
}

export type BatchEvent = {
    caseId: string,
    lifecycle: LifecycleTypes,
    timestamp: string,
    nodeId: string,
    paths: {
        [tokenId: string]: Array<string>,
    },
}

export type Batch = {
    startDate: string
    endDate: string
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
