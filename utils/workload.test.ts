import {buildWorkloadSeries} from "@utils/workload";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {makeEventWith} from "@utils/testHelpers";

describe("buildWorkloadSeries", () => {
    it("counts active cases over time and seeds frame-only cases from process start", () => {
        const result = buildWorkloadSeries(
            [
                makeEventWith(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T01:00:00.000Z"),
                makeEventWith(1, LifecycleTypes.CASE_END,     "2024-01-01T03:00:00.000Z"),
                makeEventWith(2, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T02:00:00.000Z"),
            ],
            [{caseId: 3}],
            "2024-01-01T00:00:00.000Z",
            "2024-01-01T04:00:00.000Z",
            4,
        );

        expect(result).toEqual([1, 2, 3, 2]);
    });

    it("returns an empty series when the caller asks for zero or fewer steps", () => {
        expect(buildWorkloadSeries([], [], "2024-01-01T00:00:00.000Z", "2024-01-01T04:00:00.000Z", 0)).toEqual([]);
    });

    it("ignores unrelated lifecycles and does not duplicate arrivals when frames already have them", () => {
        const result = buildWorkloadSeries(
            [
                makeEventWith(1, LifecycleTypes.START, "2024-01-01T00:30:00.000Z"),
                makeEventWith(2, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T01:00:00.000Z"),
            ],
            [{caseId: 2}],
            "2024-01-01T00:00:00.000Z",
            "2024-01-01T02:00:00.000Z",
            2,
        );

        expect(result).toEqual([0, 1]);
    });

    it("uses the default number of steps when none is provided", () => {
        const result = buildWorkloadSeries(
            [makeEventWith(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T00:00:00.000Z")],
            [],
            "2024-01-01T00:00:00.000Z",
            "2024-01-01T01:00:00.000Z",
        );

        expect(result).toHaveLength(1000);
        expect(result[0]).toBe(1);
    });
});
