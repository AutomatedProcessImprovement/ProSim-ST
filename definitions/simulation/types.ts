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

export type FrameCase = {
    case_id: number, // in some places, snake_case is used instead of camelCase because the Python service sends the data in this form
    active_elements: {
        [tokenId: string]: string,
    } | string,
}

export type BatchEvent = {
    case_id: number,
    lifecycle: LifecycleTypes,
    timestamp: string,
    node_id: string,
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

export type CaseTimes = {
    enablementTime?: number;
    startTime?: number;
    endTime?: number;
}

export type ActivityStats = {
    name: string;
    averageWT: number;
    averagePT: number;
    _count: number;
    incompleteCases: Record<number, CaseTimes>;
}

export type WTPTState = Record<string, ActivityStats>;
