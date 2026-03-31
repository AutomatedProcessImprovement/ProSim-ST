import {LifecycleTypes} from "@definitions/simulation/enums";
import {Event} from "@db/entities/Event";

export const buildCycleTimeSeries = (
    events: Event[],
    processStart: string,
    processEnd: string,
    steps = 100,
): number[] => {
    const arrivalTimes = new Map<string, number>();
    const endTimes = new Map<string, number>();

    for (const event of events) {
        const key = event.caseId.toString();
        const timestamp = new Date(event.timestamp).getTime();

        if (event.lifecycle === LifecycleTypes.CASE_ARRIVAL) {
            if (!arrivalTimes.has(key) || timestamp < (arrivalTimes.get(key) as number)) {
                arrivalTimes.set(key, timestamp);
            }
        } else if (event.lifecycle === LifecycleTypes.CASE_END) {
            if (!endTimes.has(key) || timestamp < (endTimes.get(key) as number)) {
                endTimes.set(key, timestamp);
            }
        }
    }

    const completedCTs: Array<{ endTs: number; cycleMs: number }> = [];
    endTimes.forEach((endTs, caseId) => {
        const arrivalTs = arrivalTimes.get(caseId);
        if (arrivalTs === undefined) return;

        const cycleMs = endTs - arrivalTs;
        if (cycleMs < 0) return;

        completedCTs.push({ endTs, cycleMs });
    });
    completedCTs.sort((a, b) => a.endTs - b.endTs);

    const start = new Date(processStart).getTime();
    const end = new Date(processEnd).getTime();
    const totalDuration = end - start;

    if (steps <= 0) {
        return [];
    }

    if (totalDuration <= 0) {
        return Array.from({ length: steps }, () => 0);
    }

    const step = steps === 1 ? totalDuration : totalDuration / (steps - 1);

    const result: Array<number> = [];
    let index = 0;
    let sumCycleMs = 0;
    let count = 0;

    for (let i = 0; i < steps; i++) {
        const point = start + i * step;

        while (index < completedCTs.length && completedCTs[index].endTs <= point) {
            sumCycleMs += completedCTs[index].cycleMs;
            count++;
            index++;
        }

        result.push(count === 0 ? 0 : sumCycleMs / count);
    }

    return result;
}





