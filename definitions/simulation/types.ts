import {LifecycleTypes} from "@definitions/simulation/enums";
import {Waypoint} from "@definitions/simulation/interfaces";

export type Token = SVGCircleElement

export type Tokens = {
    [caseId: string]: {
        [tokenId: string]: Token,
    },
}

export type FrameCase = {
    caseId: number,
    activeElements: {
        [tokenId: string]: string,
    },
    arrivalTime?: string | null,
}

export type BatchEvent = {
    caseId: number,
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

export type ColorMode = "state" | "age";

export type InitialView = {
    moment?: number;
    hoursPerSecond?: number;
    colorMode?: ColorMode;
};

export type TaskLoad = Record<string, {waiting: number; inWork: number}>;

export type QueueEntry = {
    caseId: number;
    state: "waiting" | "working";
    since: number | null;
    arrival: number | null;
};

export type SimulationHooks = {
    onTaskLoad?: (load: TaskLoad) => void;
    onTaskClick?: (taskId: string) => void;
    onCaseClick?: (caseId: number) => void;
    onViewChange?: () => void;
    onOpenFailed?: () => void;
    getCaseArrival?: (caseId: number) => number | undefined;
    getAverageCycleTime?: () => number | null;
    describeMoment?: (moment: number) => string | null;
};

export type TokenSimulationApi = {
    start: () => void;
    setColorMode: (mode: ColorMode) => void;
    setFollowedCase: (caseId: number | null) => void;
    describeCase: (caseId: number) => string[];
    getTaskQueue: (taskId: string) => QueueEntry[];
    getCurrentTime: () => number | null;
};
