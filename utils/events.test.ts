import {groupEvents} from "@utils/events";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {BatchEvent} from "@definitions/simulation/types";

const buildEvent = (timestamp: string, caseId: number): BatchEvent => ({
    caseId,
    lifecycle: LifecycleTypes.START,
    timestamp,
    nodeId: `node-${caseId}`,
    paths: {},
});

describe("groupEvents", () => {
    it("creates hourly batches, keeps partial start/end windows, and ignores earlier events", () => {
        const batches = groupEvents(
            [
                buildEvent("2024-01-01T09:59:59", 99),
                buildEvent("2024-01-01T10:35:00", 1),
                buildEvent("2024-01-01T11:00:00", 2),
                buildEvent("2024-01-01T12:14:00", 3),
            ],
            "2024-01-01T10:30:00.000Z",
            "2024-01-01T12:15:00.000Z",
        );

        expect(batches).toHaveLength(3);
        expect(batches.map((batch) => [batch.startDate, batch.endDate])).toEqual([
            ["2024-01-01T10:30:00.000Z", "2024-01-01T11:00:00.000Z"],
            ["2024-01-01T11:00:00.000Z", "2024-01-01T12:00:00.000Z"],
            ["2024-01-01T12:00:00.000Z", "2024-01-01T12:15:00.000Z"],
        ]);
        expect(batches.map((batch) => batch.events.map((event) => event.caseId))).toEqual([
            [1],
            [2],
            [3],
        ]);
    });

    it("does not prepend an extra partial batch when the start date is already on the hour", () => {
        const batches = groupEvents(
            [buildEvent("2024-01-01T10:10:00", 1), buildEvent("2024-01-01T11:10:00", 2)],
            "2024-01-01T10:00:00.000Z",
            "2024-01-01T12:00:00.000Z",
        );

        expect(batches).toHaveLength(2);
        expect(batches[0].events).toHaveLength(1);
        expect(batches[1].events).toHaveLength(1);
    });
});

