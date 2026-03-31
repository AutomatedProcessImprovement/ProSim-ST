import {buildCycleTimeSeries} from "@utils/cycleTime";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {makeEventWith} from "@utils/testHelpers";

describe("buildCycleTimeSeries", () => {
    it("builds a running average based on completed cases", () => {
        const result = buildCycleTimeSeries(
            [
                makeEventWith(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T00:00:00.000Z"),
                makeEventWith(1, LifecycleTypes.CASE_END,     "2024-01-01T01:00:00.000Z"),
                makeEventWith(2, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T00:30:00.000Z"),
                makeEventWith(2, LifecycleTypes.CASE_END,     "2024-01-01T02:00:00.000Z"),
            ],
            "2024-01-01T00:00:00.000Z",
            "2024-01-01T02:00:00.000Z",
            5,
        );

        expect(result).toEqual([0, 0, 3600000, 3600000, 4500000]);
    });

    it("uses the earliest arrival/end pair and ignores incomplete or invalid cases", () => {
        const result = buildCycleTimeSeries(
            [
                makeEventWith(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T02:00:00.000Z"),
                makeEventWith(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T01:00:00.000Z"),
                makeEventWith(1, LifecycleTypes.CASE_END,     "2024-01-01T05:00:00.000Z"),
                makeEventWith(1, LifecycleTypes.CASE_END,     "2024-01-01T04:00:00.000Z"),
                makeEventWith(2, LifecycleTypes.CASE_END,     "2024-01-01T03:00:00.000Z"),
                makeEventWith(3, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T03:00:00.000Z"),
                makeEventWith(3, LifecycleTypes.CASE_END,     "2024-01-01T02:00:00.000Z"),
            ],
            "2024-01-01T00:00:00.000Z",
            "2024-01-01T05:00:00.000Z",
            6,
        );

        expect(result[result.length - 1]).toBe(10800000);
        expect(result.filter((value) => value > 0)).toEqual([10800000, 10800000]);
    });

    it("returns empty output for non-positive steps and zeros for invalid durations", () => {
        expect(buildCycleTimeSeries([], "2024-01-01T00:00:00.000Z", "2024-01-01T01:00:00.000Z", 0)).toEqual([]);
        expect(buildCycleTimeSeries([], "2024-01-01T01:00:00.000Z", "2024-01-01T01:00:00.000Z", 3)).toEqual([0, 0, 0]);
    });

    it("ignores unrelated lifecycle events and handles the single-step shortcut", () => {
        const result = buildCycleTimeSeries(
            [
                makeEventWith(1, LifecycleTypes.START, "2024-01-01T00:10:00.000Z"),
                makeEventWith(2, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T00:00:00.000Z"),
                makeEventWith(2, LifecycleTypes.CASE_END, "2024-01-01T01:00:00.000Z"),
            ],
            "2024-01-01T00:00:00.000Z",
            "2024-01-01T01:00:00.000Z",
            1,
        );

        expect(result).toEqual([0]);
    });

    it("keeps the earliest arrival and earliest completion when later duplicates exist", () => {
        const result = buildCycleTimeSeries(
            [
                makeEventWith(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T00:00:00.000Z"),
                makeEventWith(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T00:30:00.000Z"),
                makeEventWith(1, LifecycleTypes.CASE_END, "2024-01-01T01:00:00.000Z"),
                makeEventWith(1, LifecycleTypes.CASE_END, "2024-01-01T02:00:00.000Z"),
            ],
            "2024-01-01T00:00:00.000Z",
            "2024-01-01T02:00:00.000Z",
        );

        expect(result[result.length - 1]).toBe(3600000);
    });
});

