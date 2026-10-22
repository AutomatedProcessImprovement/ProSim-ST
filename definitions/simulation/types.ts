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
    // When a case open at the starting point started, in UTC, as found in the event log; null when unknown
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

// Dots coloured by what the case is doing, or by how long the case has been open
export type ColorMode = "state" | "age";

// Per task: cases waiting for it and cases being worked on
export type TaskLoad = Record<string, {waiting: number; inWork: number}>;

export type QueueEntry = {
    caseId: number;
    state: "waiting" | "working";
    // When the case started waiting or started being worked on (ms since epoch), when known
    since: number | null;
    // When the case arrived (ms since epoch), when known
    arrival: number | null;
};

// Read by the simulation while it runs, so the page can fill them in later (e.g. once the analysis has loaded)
export type SimulationHooks = {
    onTaskLoad?: (load: TaskLoad) => void;
    onTaskClick?: (taskId: string) => void;
    getCaseArrival?: (caseId: number) => number | undefined;
    getAverageCycleTime?: () => number | null;
    // Extra text for the timeline tooltip at a moment (ms since epoch)
    describeMoment?: (moment: number) => string | null;
};

export type TokenSimulationApi = {
    start: () => void;
    setColorMode: (mode: ColorMode) => void;
    getTaskQueue: (taskId: string) => QueueEntry[];
    getCurrentTime: () => number | null;
};
