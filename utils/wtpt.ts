import {LifecycleTypes} from "@definitions/simulation/enums";
import {CaseTimes, FrameCase, WTPTState} from "@definitions/simulation/types";

const emptyStats = (nodeId: string): WTPTState[string] => ({
    name: nodeId,
    averageWT: 0,
    averagePT: 0,
    _count: 0,
    incompleteCases: {},
});

export const buildWTPTState = (events: Array<{
    nodeId: string;
    caseId: number;
    lifecycle: LifecycleTypes;
    timestamp: string;
}>, openCases: FrameCase[] = []): WTPTState => {
    const state: WTPTState = {};

    for (const {caseId, taskTimes} of openCases) {
        for (const [nodeId, {enabled, started}] of Object.entries(taskTimes ?? {})) {
            state[nodeId] ??= emptyStats(nodeId);
            state[nodeId].incompleteCases[caseId] = started === null
                ? {enablementTime: enabled}
                : {enablementTime: enabled, startTime: started};
        }
    }

    for (const ev of events) {
        const nodeId = ev.nodeId;
        const caseId = ev.caseId;

        if (!nodeId) continue;

        const ts = new Date(ev.timestamp + "Z").getTime();

        state[nodeId] ??= emptyStats(nodeId);

        const nodeState = state[nodeId];
        const prevCase: CaseTimes = nodeState.incompleteCases?.[caseId] ?? {};

        if (ev.lifecycle === LifecycleTypes.ENABLE) {
            nodeState.incompleteCases[caseId] = {
                ...prevCase,
                enablementTime: ts,
            };
            continue;
        }

        if (ev.lifecycle === LifecycleTypes.START) {
            if (prevCase.enablementTime == null) continue;
            nodeState.incompleteCases[caseId] = {
                ...prevCase,
                startTime: ts,
            };
            continue;
        }

        if (ev.lifecycle === LifecycleTypes.COMPLETE) {
            if (prevCase.enablementTime == null || prevCase.startTime == null) continue;
            const nextCase: CaseTimes = {
                ...prevCase,
                endTime: ts,
            };

            const wt = nextCase.startTime - nextCase.enablementTime;
            const pt = nextCase.endTime - nextCase.startTime;

            if (wt < 0 || pt < 0) {
                continue;
            }

            const n = nodeState._count ?? 0;
            nodeState.averageWT = (nodeState.averageWT * n + wt) / (n + 1);
            nodeState.averagePT = (nodeState.averagePT * n + pt) / (n + 1);
            nodeState._count = n + 1;

            const { [caseId]: _removed, ...rest } = nodeState.incompleteCases;
            void _removed;
            nodeState.incompleteCases = rest;
        }
    }

    return state;
}






