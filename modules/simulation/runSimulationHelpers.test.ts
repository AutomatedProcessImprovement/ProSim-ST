import {LifecycleTypes} from "@definitions/simulation/enums";
import {BatchEvent} from "@definitions/simulation/types";
import {
    computeProportionalDelta,
    computeTokenAnimationStartTime,
    groupEventsByCaseId,
    shouldTopUpQueue,
} from "@modules/simulation/runSimulationHelpers";

function makeEvent(caseId: number): BatchEvent {
    return {
        caseId,
        lifecycle: LifecycleTypes.START,
        timestamp: "2024-01-01T00:00:00.000Z",
        nodeId: "Task_A",
        paths: {t1: ["Task_A", "Task_B"]},
    };
}

describe("shouldTopUpQueue", () => {
    it("triggers top-up when queue is at threshold and pointer is positive", () => {
        expect(shouldTopUpQueue(5, 1)).toBe(true);
    });

    it("triggers top-up when queue is below threshold", () => {
        expect(shouldTopUpQueue(3, 10)).toBe(true);
    });

    it("does not trigger when queue exceeds threshold", () => {
        expect(shouldTopUpQueue(6, 10)).toBe(false);
    });

    it("uses a custom threshold for fast playback", () => {
        expect(shouldTopUpQueue(40, 3, 48)).toBe(true);
        expect(shouldTopUpQueue(49, 3, 48)).toBe(false);
    });

    it("does not trigger when pointer is zero regardless of queue size", () => {
        expect(shouldTopUpQueue(2, 0)).toBe(false);
    });
});

describe("computeProportionalDelta", () => {
    it("computes proportional animation delta from batch duration", () => {
        expect(computeProportionalDelta(2000, 3600000)).toBe(2000);
    });

    it("computes smaller delta for shorter batch", () => {
        expect(computeProportionalDelta(2000, 1800000)).toBe(1000);
    });
});

describe("groupEventsByCaseId", () => {
    it("groups events by case id", () => {
        const events = [makeEvent(1), makeEvent(2), makeEvent(1)];
        const result = groupEventsByCaseId(events);

        expect(result[1]).toHaveLength(2);
        expect(result[2]).toHaveLength(1);
    });

    it("returns empty object for empty input", () => {
        expect(groupEventsByCaseId([])).toEqual({});
    });
});

describe("computeTokenAnimationStartTime", () => {
    it("returns unmodified start time when not resumed", () => {
        expect(computeTokenAnimationStartTime(100, 2000, false, 0.5)).toBe(100);
    });

    it("returns unmodified start time when token progress is missing", () => {
        expect(computeTokenAnimationStartTime(100, 2000, true, undefined)).toBe(100);
    });

    it("shifts start time backward when resumed with saved token progress", () => {
        expect(computeTokenAnimationStartTime(100, 2000, true, 0.25)).toBe(-400);
    });
});

