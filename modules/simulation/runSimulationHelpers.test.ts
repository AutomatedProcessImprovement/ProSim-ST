import {LifecycleTypes} from "@definitions/simulation/enums";
import {BatchEvent} from "@definitions/simulation/types";
import {
    computeEmptyBatchWaitTime,
    computeProportionalDelta,
    groupEventsByCaseId,
    shouldTopUpQueue,
    shouldUpdateFrames,
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

describe("shouldUpdateFrames", () => {
    it("returns true when localProgress is zero and batch end matches current time", () => {
        const date = new Date("2024-01-01T12:00:00.000Z");
        expect(shouldUpdateFrames(0, "2024-01-01T12:00:00.000Z", date)).toBe(true);
    });

    it("returns false when localProgress is non-zero", () => {
        const date = new Date("2024-01-01T12:00:00.000Z");
        expect(shouldUpdateFrames(0.5, "2024-01-01T12:00:00.000Z", date)).toBe(false);
    });

    it("returns false when batch end does not match current time", () => {
        const date = new Date("2024-01-01T13:00:00.000Z");
        expect(shouldUpdateFrames(0, "2024-01-01T12:00:00.000Z", date)).toBe(false);
    });
});

describe("computeEmptyBatchWaitTime", () => {
    it("returns full proportional delta when not resumed", () => {
        expect(computeEmptyBatchWaitTime(1000, false, 0)).toBe(1000);
    });

    it("reduces wait time proportionally when resumed mid-batch", () => {
        expect(computeEmptyBatchWaitTime(1000, true, 0.4)).toBe(600);
    });

    it("returns full wait time when resumed but localProgress is zero", () => {
        expect(computeEmptyBatchWaitTime(1000, true, 0)).toBe(1000);
    });
});
