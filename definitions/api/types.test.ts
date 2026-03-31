import {mapPyBatchEvent, mapPyFrameCase} from "@definitions/api/types";
import {LifecycleTypes} from "@definitions/simulation/enums";

describe("API type mappers", () => {
    it("maps python batch events into app batch events", () => {
        expect(mapPyBatchEvent({
            case_id: 5,
            lifecycle: LifecycleTypes.COMPLETE,
            timestamp: "2024-01-01 10:00:00",
            node_id: "Task_1",
            paths: {tokenA: ["Flow_1", "Task_1"]},
        })).toEqual({
            caseId: 5,
            lifecycle: LifecycleTypes.COMPLETE,
            timestamp: "2024-01-01 10:00:00",
            nodeId: "Task_1",
            paths: {tokenA: ["Flow_1", "Task_1"]},
        });
    });

    it("maps python frames into app frame cases", () => {
        expect(mapPyFrameCase({
            case_id: 9,
            active_elements: {tokenA: "Flow_2", tokenB: "Task_3"},
        })).toEqual({
            caseId: 9,
            activeElements: {tokenA: "Flow_2", tokenB: "Task_3"},
        });
    });
});

