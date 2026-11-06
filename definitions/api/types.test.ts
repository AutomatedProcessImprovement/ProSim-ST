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

    it("keeps the times of tasks a case was already at, in milliseconds", () => {
        expect(mapPyFrameCase({
            case_id: 9,
            active_elements: {tokenA: "Task_3"},
            task_times: {
                Task_3: {enabled: "2024-01-01T10:00:00.000000+0200", started: null},
                Task_4: {enabled: "2024-01-01T10:00:00.000000+0200", started: "2024-01-01T11:00:00.000000+0200"},
            },
        })).toEqual({
            caseId: 9,
            activeElements: {tokenA: "Task_3"},
            taskTimes: {
                Task_3: {enabled: Date.UTC(2024, 0, 1, 8), started: null},
                Task_4: {enabled: Date.UTC(2024, 0, 1, 8), started: Date.UTC(2024, 0, 1, 9)},
            },
        });
    });

    it("drops an empty set of task times", () => {
        expect(mapPyFrameCase({case_id: 9, active_elements: {}, task_times: {}})).toEqual({caseId: 9, activeElements: {}});
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

    it("keeps when a case open at the start started, in UTC, and leaves it out when unknown", () => {
        expect(mapPyFrameCase({case_id: 9, active_elements: {}, arrival_time: "2025-02-17T09:00:00.646000+0200"}))
            .toEqual({caseId: 9, activeElements: {}, arrivalTime: "2025-02-17T07:00:00.646Z"});
        expect(mapPyFrameCase({case_id: 9, active_elements: {}, arrival_time: null})).toEqual({caseId: 9, activeElements: {}});
        expect(mapPyFrameCase({case_id: 9, active_elements: {}, arrival_time: "not a date"})).toEqual({caseId: 9, activeElements: {}});
    });
});

