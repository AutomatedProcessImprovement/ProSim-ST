import {caseBounds, CaseEvent, visitedElements} from "@utils/casePath";
import {LifecycleTypes} from "@definitions/simulation/enums";

const events: CaseEvent[] = [
    {lifecycle: LifecycleTypes.CASE_ARRIVAL, nodeId: "Start", timestamp: "2024-01-01 00:00:00", paths: {t: ["Start", "Flow_1"]}},
    {lifecycle: LifecycleTypes.START, nodeId: "Task_A", timestamp: "2024-01-01 01:00:00", paths: {t: ["Task_A"]}},
    {lifecycle: LifecycleTypes.COMPLETE, nodeId: "Task_A", timestamp: "2024-01-01 02:00:00", paths: {t: ["Task_A", "Flow_2"]}},
    {lifecycle: LifecycleTypes.CASE_END, nodeId: "End", timestamp: "2024-01-01 03:00:00", paths: {t: ["End"]}},
];
const at = (hour: number) => Date.UTC(2024, 0, 1, hour);

describe("utils/casePath", () => {
    it("collects the elements reached by a moment", () => {
        expect([...visitedElements(events, [], at(1))]).toEqual(["Start", "Flow_1", "Task_A"]);
        expect([...visitedElements(events, [], at(3))]).toEqual(["Start", "Flow_1", "Task_A", "Flow_2", "End"]);
    });

    it("starts from where a case stood when the simulation began", () => {
        expect([...visitedElements([], ["Task_Z"], at(0))]).toEqual(["Task_Z"]);
    });

    it("finds when a case arrived and ended", () => {
        expect(caseBounds(events)).toEqual({arrival: at(0), end: at(3)});
        expect(caseBounds([])).toEqual({arrival: null, end: null});
    });
});
