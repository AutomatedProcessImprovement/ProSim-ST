import {BatchEvent, FrameCase, WTPTState} from "@definitions/simulation/types";
import {LifecycleTypes} from "@definitions/simulation/enums";

export function setNewWTPTState(previousState: WTPTState, event: BatchEvent): WTPTState {
    const nodeId = event.nodeId;
    const caseId = event.caseId;
    const timestamp = new Date(event.timestamp).getTime();

    if (
        event.lifecycle !== LifecycleTypes.ENABLE &&
        event.lifecycle !== LifecycleTypes.START &&
        event.lifecycle !== LifecycleTypes.COMPLETE
    ) {
        return previousState;
    }

    const nodeState = previousState[nodeId];
    if (!nodeState) {
        return previousState;
    }

    const prevCase = nodeState.incompleteCases?.[caseId];

    if (event.lifecycle === LifecycleTypes.ENABLE) {
        return {
            ...previousState,
            [nodeId]: {
                ...nodeState,
                incompleteCases: {
                    ...nodeState.incompleteCases,
                    [caseId]: {
                        ...(prevCase ?? {}),
                        enablementTime: timestamp,
                    },
                },
            },
        };
    }

    if (!prevCase?.enablementTime) {
        return previousState;
    }

    if (event.lifecycle === LifecycleTypes.START) {
        return {
            ...previousState,
            [nodeId]: {
                ...nodeState,
                incompleteCases: {
                    ...nodeState.incompleteCases,
                    [caseId]: {
                        ...prevCase,
                        startTime: timestamp,
                    },
                },
            },
        };
    }

    if (!prevCase.startTime) return previousState;

    const wt = prevCase.startTime - prevCase.enablementTime;
    const pt = timestamp - prevCase.startTime;

    if (wt < 0 || pt < 0) {
        return previousState;
    }

    const n = nodeState._count ?? 0;
    const newAvgWT = (nodeState.averageWT * n + wt) / (n + 1);
    const newAvgPT = (nodeState.averagePT * n + pt) / (n + 1);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [caseId]: _removed, ...restIncomplete } = nodeState.incompleteCases;

    return {
        ...previousState,
        [nodeId]: {
            ...nodeState,
            averageWT: newAvgWT,
            averagePT: newAvgPT,
            _count: n + 1,
            incompleteCases: restIncomplete,
        },
    };
}

export function seedOpenCases(state: WTPTState, frames: FrameCase[]): WTPTState {
    const seeded = {...state};
    frames.forEach(({caseId, taskTimes}) => {
        Object.entries(taskTimes ?? {}).forEach(([taskId, {enabled, started}]) => {
            const stats = seeded[taskId];
            if (!stats) return;
            const times = started === null ? {enablementTime: enabled} : {enablementTime: enabled, startTime: started};
            seeded[taskId] = {...stats, incompleteCases: {...stats.incompleteCases, [caseId]: times}};
        });
    });
    return seeded;
}

export function hydrateWTPTNames(base: WTPTState, incoming: WTPTState): WTPTState {
    const out: WTPTState = {};

    for (const [nodeId, stats] of Object.entries(incoming)) {
        if (!base[nodeId]) continue;

        out[nodeId] = {
            ...stats,
            name: base[nodeId].name,
        };
    }

    for (const [nodeId, baseStats] of Object.entries(base)) {
        if (out[nodeId]) continue;

        out[nodeId] = {
            name: baseStats.name,
            averageWT: 0,
            averagePT: 0,
            _count: 0,
            incompleteCases: {},
        };
    }

    return out;
}

