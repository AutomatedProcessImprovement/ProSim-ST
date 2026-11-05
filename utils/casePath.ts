import {LifecycleTypes} from "@definitions/simulation/enums";
import {toUtcMs} from "@utils/processAnalysis";

export type CaseEvent = {
    lifecycle: LifecycleTypes | string;
    nodeId: string | null;
    timestamp: string;
    paths: Record<string, string[]>;
};

export const visitedElements = (events: CaseEvent[], startElements: string[], moment: number): Set<string> => {
    const visited = new Set(startElements);
    for (const event of events) {
        if (toUtcMs(event.timestamp) > moment) break;
        if (event.nodeId) visited.add(event.nodeId);
        Object.values(event.paths ?? {}).forEach(path => path.forEach(elementId => visited.add(elementId)));
    }
    return visited;
};

export const caseBounds = (events: CaseEvent[]) => {
    const moment = (lifecycle: LifecycleTypes) => {
        const event = events.find(candidate => candidate.lifecycle === lifecycle);
        return event ? toUtcMs(event.timestamp) : null;
    };
    return {arrival: moment(LifecycleTypes.CASE_ARRIVAL), end: moment(LifecycleTypes.CASE_END)};
};
