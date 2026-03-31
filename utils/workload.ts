import {LifecycleTypes} from "@definitions/simulation/enums";
import {Event} from "@db/entities/Event";

export const buildWorkloadSeries = (
    events: Event[],
    frames: Array<{ caseId: number }>,
    processStart: string,
    processEnd: string,
    steps = 1000,
): number[] => {
    const arrivalTimes = new Map<string, Date>();
    const endTimes = new Map<string, Date>();

    for (const event of events) {
        switch (event.lifecycle) {
            case LifecycleTypes.CASE_ARRIVAL:
                arrivalTimes.set(event.caseId.toString(), new Date(event.timestamp));
                break;
            case LifecycleTypes.CASE_END:
                endTimes.set(event.caseId.toString(), new Date(event.timestamp));
                break;
            default:
                break;
        }
    }

    for (const frame of frames) {
        const key = frame.caseId.toString();
        if (!arrivalTimes.has(key)) {
            arrivalTimes.set(key, new Date(processStart));
        }
    }

    const start = new Date(processStart);
    const end = new Date(processEnd);
    const totalDuration = end.getTime() - start.getTime();

    if (steps <= 0) {
        return [];
    }

    const step = totalDuration / steps;

    const changes: Array<{ timestamp: number; effect: number }> = [];

    arrivalTimes.forEach((date) => changes.push({ timestamp: date.getTime(), effect: +1 }));
    endTimes.forEach((date) => changes.push({ timestamp: date.getTime(), effect: -1 }));
    changes.sort((a, b) => a.timestamp - b.timestamp);

    const result: Array<number> = [];
    let activeCount = 0;
    let index = 0;

    for (let i = 0; i < steps; i++) {
        const point = start.getTime() + i * step;
        while (index < changes.length && changes[index].timestamp <= point) {
            activeCount += changes[index].effect;
            index++;
        }
        result.push(activeCount);
    }

    return result;
}







