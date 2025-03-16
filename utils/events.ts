import {Batch, BatchEvent} from "@definitions/simulation/types";

export const groupEvents = (events: Array<BatchEvent>): Array<Batch> => {
    const sortedEvents = [...events].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const endTimestamp = sortedEvents[sortedEvents.length - 1].timestamp;
    const batches = generateEmptyBatches(sortedEvents[0].timestamp, endTimestamp);

    let batchIndex = 0;
    for (const event of sortedEvents) {
        const eventDate = new Date(event.timestamp);
        if (event.timestamp === endTimestamp) batchIndex = batches.length - 1;
        else while (eventDate >= new Date(batches[batchIndex].endDate)) {
            batchIndex++;
        }
        batches[batchIndex].events.push(event);
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
