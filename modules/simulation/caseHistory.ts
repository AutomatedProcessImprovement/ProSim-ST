import {LifecycleTypes} from "@definitions/simulation/enums";
import {BatchEvent, SimulationHooks, WTPTState} from "@definitions/simulation/types";
import {Rest} from "@modules/simulation/restLayout";
import {toUtcMs} from "@utils/processAnalysis";

export type CaseHistory = ReturnType<typeof createCaseHistory>;

export function createCaseHistory(hooks: SimulationHooks, openCaseIds: number[]) {
    const taskTimes = new Map<number, Map<string, {enabled?: number; started?: number}>>();
    const seenArrivals = new Map<number, number>();
    const openAtStart = new Set(openCaseIds);

    function arrivalOf(caseId: number): number | null {
        return hooks.getCaseArrival?.(caseId) ?? seenArrivals.get(caseId) ?? null;
    }

    function sinceOf(rest: Rest): number | null {
        const times = rest.place.taskId ? taskTimes.get(rest.caseId)?.get(rest.place.taskId) : undefined;
        if (rest.place.kind === "waiting") return times?.enabled ?? null;
        if (rest.place.kind === "working") return times?.started ?? null;
        return null;
    }

    function noteBatchEvents(events: BatchEvent[]) {
        events.forEach(event => {
            const timestamp = toUtcMs(event.timestamp);
            if (event.lifecycle === LifecycleTypes.CASE_ARRIVAL) {
                if (!seenArrivals.has(event.caseId)) seenArrivals.set(event.caseId, timestamp);
                return;
            }
            if (event.lifecycle === LifecycleTypes.CASE_END) {
                taskTimes.delete(event.caseId);
                return;
            }
            if (!event.nodeId) return;
            if (!taskTimes.has(event.caseId)) taskTimes.set(event.caseId, new Map());
            const caseTasks = taskTimes.get(event.caseId);
            if (event.lifecycle === LifecycleTypes.ENABLE) caseTasks.set(event.nodeId, {enabled: timestamp});
            else if (event.lifecycle === LifecycleTypes.START) caseTasks.set(event.nodeId, {...caseTasks.get(event.nodeId), started: timestamp});
            else if (event.lifecycle === LifecycleTypes.COMPLETE) caseTasks.delete(event.nodeId);
        });
    }

    function seedTaskTimes(wtpt: WTPTState | undefined) {
        taskTimes.clear();
        Object.entries(wtpt ?? {}).forEach(([taskId, stats]) => {
            Object.entries(stats.incompleteCases ?? {}).forEach(([caseId, times]) => {
                const id = Number(caseId);
                if (!taskTimes.has(id)) taskTimes.set(id, new Map());
                taskTimes.get(id).set(taskId, {enabled: times.enablementTime, started: times.startTime});
            });
        });
    }

    return {
        arrivalOf,
        sinceOf,
        noteBatchEvents,
        seedTaskTimes,
        wasOpenAtStart: (caseId: number) => openAtStart.has(caseId),
    };
}
