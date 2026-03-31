import {buildWTPTState} from "@utils/wtpt";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {makeEvent} from "@utils/testHelpers";

describe("buildWTPTState", () => {
    it("computes average waiting and processing times across completed cases", () => {
        const result = buildWTPTState([
            makeEvent({caseId: 1, lifecycle: LifecycleTypes.ENABLE,   timestamp: "2024-01-01 09:00:00", nodeId: "Task_A"}),
            makeEvent({caseId: 1, lifecycle: LifecycleTypes.START,    timestamp: "2024-01-01 10:00:00", nodeId: "Task_A"}),
            makeEvent({caseId: 1, lifecycle: LifecycleTypes.COMPLETE, timestamp: "2024-01-01 12:00:00", nodeId: "Task_A"}),
            makeEvent({caseId: 2, lifecycle: LifecycleTypes.ENABLE,   timestamp: "2024-01-01 09:30:00", nodeId: "Task_A"}),
            makeEvent({caseId: 2, lifecycle: LifecycleTypes.START,    timestamp: "2024-01-01 10:00:00", nodeId: "Task_A"}),
            makeEvent({caseId: 2, lifecycle: LifecycleTypes.COMPLETE, timestamp: "2024-01-01 11:00:00", nodeId: "Task_A"}),
        ]);

        expect(result.Task_A).toEqual({
            name: "Task_A",
            averageWT: 2700000,
            averagePT: 5400000,
            _count: 2,
            incompleteCases: {},
        });
    });

    it("ignores invalid transitions and keeps incomplete cases open", () => {
        const result = buildWTPTState([
            makeEvent({caseId: 1, lifecycle: LifecycleTypes.ENABLE,   timestamp: "2024-01-01 09:00:00", nodeId: ""}),
            makeEvent({caseId: 1, lifecycle: LifecycleTypes.START,    timestamp: "2024-01-01 09:30:00", nodeId: "Task_B"}),
            makeEvent({caseId: 2, lifecycle: LifecycleTypes.ENABLE,   timestamp: "2024-01-01 11:00:00", nodeId: "Task_B"}),
            makeEvent({caseId: 2, lifecycle: LifecycleTypes.START,    timestamp: "2024-01-01 10:00:00", nodeId: "Task_B"}),
            makeEvent({caseId: 2, lifecycle: LifecycleTypes.COMPLETE, timestamp: "2024-01-01 12:00:00", nodeId: "Task_B"}),
            makeEvent({caseId: 3, lifecycle: LifecycleTypes.ENABLE,   timestamp: "2024-01-01 12:00:00", nodeId: "Task_B"}),
            makeEvent({caseId: 3, lifecycle: LifecycleTypes.START,    timestamp: "2024-01-01 12:30:00", nodeId: "Task_B"}),
        ]);

        expect(result.Task_B.averageWT).toBe(0);
        expect(result.Task_B.averagePT).toBe(0);
        expect(result.Task_B._count).toBe(0);
        expect(result.Task_B.incompleteCases[2]).toEqual({
            enablementTime: new Date("2024-01-01T11:00:00.000Z").getTime(),
            startTime:      new Date("2024-01-01T10:00:00.000Z").getTime(),
        });
        expect(result.Task_B.incompleteCases[3]).toEqual({
            enablementTime: new Date("2024-01-01T12:00:00.000Z").getTime(),
            startTime:      new Date("2024-01-01T12:30:00.000Z").getTime(),
        });
    });

    it("ignores COMPLETE events that are missing prerequisite timestamps", () => {
        const result = buildWTPTState([
            makeEvent({caseId: 4, lifecycle: LifecycleTypes.ENABLE, timestamp: "2024-01-01 13:00:00", nodeId: "Task_C"}),
            makeEvent({caseId: 4, lifecycle: LifecycleTypes.COMPLETE, timestamp: "2024-01-01 14:00:00", nodeId: "Task_C"}),
            makeEvent({caseId: 5, lifecycle: LifecycleTypes.COMPLETE, timestamp: "2024-01-01 15:00:00", nodeId: "Task_C"}),
        ]);

        expect(result.Task_C).toEqual({
            name: "Task_C",
            averageWT: 0,
            averagePT: 0,
            _count: 0,
            incompleteCases: {
                4: {
                    enablementTime: new Date("2024-01-01T13:00:00.000Z").getTime(),
                },
            },
        });
    });
});
