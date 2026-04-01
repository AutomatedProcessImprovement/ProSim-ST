import {BatchEvent, WTPTState} from "@definitions/simulation/types";
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

    // ENABLE is the only event allowed to create a case entry
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

    // If we don't have enablementTime, ignore START/COMPLETE
    if (!prevCase?.enablementTime) {
        return previousState;
    }

    // START only allowed after ENABLE
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

    // COMPLETE only allowed after ENABLE + START
    if (!prevCase.startTime) return previousState;

    // COMPLETE: now we can compute and finalize
    const wt = prevCase.startTime - prevCase.enablementTime;
    const pt = timestamp - prevCase.startTime;

    // ignore out-of-order / invalid data
    if (wt < 0 || pt < 0) {
        return previousState;
    }

    // incremental averages
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

export function hydrateWTPTNames(base: WTPTState, incoming: WTPTState): WTPTState {
    const out: WTPTState = {};

    for (const [nodeId, stats] of Object.entries(incoming)) {
        if (!base[nodeId]) continue;

        out[nodeId] = {
            ...stats,
            name: base[nodeId].name,
        };
    }

    // ensure ALL base tasks exist (reset missing ones)
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

