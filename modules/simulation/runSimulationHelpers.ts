import {BatchEvent, EventsByCaseId} from "@definitions/simulation/types";

const QUEUE_TOP_UP_THRESHOLD = 5;
const MS_PER_HOUR = 3600000;

export function shouldTopUpQueue(queueLength: number, batchesPointer: number, threshold = QUEUE_TOP_UP_THRESHOLD): boolean {
    return queueLength <= threshold && batchesPointer > 0;
}

export function computeProportionalDelta(delta: number, batchDuration: number): number {
    return delta * batchDuration / MS_PER_HOUR;
}

export function groupEventsByCaseId(events: BatchEvent[]): EventsByCaseId {
    const result: EventsByCaseId = {};
    events.forEach((event) => {
        if (!result[event.caseId]) result[event.caseId] = [];
        result[event.caseId].push(event);
    });
    return result;
}

export function computeTokenAnimationStartTime(
    baseStartTime: number,
    duration: number,
    isResumed: boolean,
    tokenProgress: number | undefined,
): number {
    if (!isResumed || !tokenProgress) return baseStartTime;
    return baseStartTime - tokenProgress * duration;
}

