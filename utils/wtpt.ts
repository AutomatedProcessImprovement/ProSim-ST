import {LifecycleTypes} from "@definitions/simulation/enums";
import {CaseTimes, WTPTState} from "@definitions/simulation/types";

export const buildWTPTState = (events: Array<{
    nodeId: string;
    caseId: number;
    lifecycle: LifecycleTypes;
    timestamp: string;
}>): WTPTState => {
    const state: WTPTState = {};

    for (const ev of events) {
        const nodeId = ev.nodeId;
        const caseId = ev.caseId;

        if (!nodeId) continue;

        const ts = new Date(ev.timestamp + "Z").getTime();

        if (!state[nodeId]) {
            state[nodeId] = {
                name: nodeId, // name will be overridden on the client side from the BPMN map anyway
                averageWT: 0,
                averagePT: 0,
                _count: 0,
                incompleteCases: {},
            };
        }

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






