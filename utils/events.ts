import {Batch, BatchEvent} from "@definitions/simulation/types";

export const groupEvents = (events: Array<BatchEvent>, startDate: string, endDate: string): Array<Batch> => {
    const batches = generateEmptyBatches(startDate, endDate);
    const initialBatchDate = new Date(startDate);
    initialBatchDate.setMinutes(0, 0, 0);

    for (const event of events) {
        const eventDate = new Date(event.timestamp);
        const diffMs = (eventDate.getTime() - initialBatchDate.getTime()) / (1000 * 60 * 60)
        if (diffMs >= 0) {
            batches[Math.floor(diffMs)].events.push(event);
        }
    }

    return batches;
}

const generateEmptyBatches = (startDate: string, endDate: string): Array<Batch> => {
    const emptyBatches: Array<Batch> = [];

    const start = new Date(startDate);
    const end = new Date(endDate);

    start.setMinutes(0, 0, 0);
    if (start < new Date(startDate)) {
        let nextHour = new Date(start);
        nextHour.setHours(nextHour.getHours() + 1);
        emptyBatches.push({
            startDate: startDate,
            endDate: nextHour.toISOString(),
            events: []
        });

        start.setHours(start.getHours() + 1);
    }

    while (start < end) {
        let nextHour = new Date(start);
        nextHour.setHours(nextHour.getHours() + 1);

        emptyBatches.push({
            startDate: start.toISOString(),
            endDate: nextHour.toISOString(),
            events: []
        });

        start.setHours(start.getHours() + 1);
    }

    if (new Date(emptyBatches[emptyBatches.length - 1].endDate) > end) {
        emptyBatches[emptyBatches.length - 1].endDate = endDate;
    }

    return emptyBatches;
}
