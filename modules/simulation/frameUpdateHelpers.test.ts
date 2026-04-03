import {LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";
import {Batch, BatchEvent, FrameCase, WTPTState} from "@definitions/simulation/types";
import {applyBatchFrameUpdates, applyBatchFrameUpdatesIfNeeded} from "@modules/simulation/frameUpdateHelpers";

function makeEvent(overrides: Partial<BatchEvent>): BatchEvent {
    return {
        caseId: 1,
        lifecycle: LifecycleTypes.START,
        timestamp: "2024-01-01T00:00:00.000Z",
        nodeId: "Task_A",
        paths: {t1: ["Task_A", "Task_B"]},
        ...overrides,
    };
}

function makeWtptSetter() {
    const base: WTPTState = {
        Task_A: {name: "Task A", averageWT: 0, averagePT: 0, _count: 0, incompleteCases: {}},
    };

    return jest.fn((updater: ((prev: WTPTState) => WTPTState) | WTPTState) => {
        if (typeof updater === "function") {
            (updater as (prev: WTPTState) => WTPTState)(base);
        }
    });
}

describe("applyBatchFrameUpdates", () => {
    it("applies batch events, updates counters and WTPT", () => {
        const frames: FrameCase[] = [];
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [makeEvent({lifecycle: LifecycleTypes.CASE_ARRIVAL, paths: {t1: ["Task_A"]}})],
        };

        const countersState = {ongoing: 0, finished: 0};
        const caseNumberSetter = jest.fn((updater: ((state: typeof countersState) => typeof countersState) | typeof countersState) => {
            if (typeof updater === "function") {
                const next = updater(countersState);
                countersState.ongoing = next.ongoing;
                countersState.finished = next.finished;
            }
        });
        const wtptSetter = makeWtptSetter();

        const nextFrames = applyBatchFrameUpdates({
            frames,
            batch,
            getNodeType: () => NodeTypes.TASK,
            caseNumberSetter,
            wtptSetter,
        });

        expect(nextFrames).toEqual([{caseId: 1, activeElements: {t1: "Task_A"}}]);
        expect(caseNumberSetter).toHaveBeenCalledWith(expect.any(Function));
        expect(countersState).toEqual({ongoing: 1, finished: 0});
        expect(wtptSetter).toHaveBeenCalledWith(expect.any(Function));
    });

    it("executes case counter updater for CASE_END events", () => {
        const frames: FrameCase[] = [{caseId: 1, activeElements: {t1: "Task_A"}}];
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [makeEvent({lifecycle: LifecycleTypes.CASE_END, paths: {t1: ["Task_A"]}})],
        };

        const countersState = {ongoing: 3, finished: 1};
        const caseNumberSetter = jest.fn((updater: ((state: typeof countersState) => typeof countersState) | typeof countersState) => {
            if (typeof updater === "function") {
                const next = updater(countersState);
                countersState.ongoing = next.ongoing;
                countersState.finished = next.finished;
            }
        });
        const wtptSetter = makeWtptSetter();

        const nextFrames = applyBatchFrameUpdates({
            frames,
            batch,
            getNodeType: () => NodeTypes.TASK,
            caseNumberSetter,
            wtptSetter,
        });

        expect(nextFrames).toEqual([]);
        expect(caseNumberSetter).toHaveBeenCalledWith(expect.any(Function));
        expect(countersState).toEqual({ongoing: 2, finished: 2});
    });

    it("handles multi-token events without counter updates", () => {
        const frames: FrameCase[] = [{caseId: 1, activeElements: {main: "PGW"}}];
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [makeEvent({
                paths: {
                    t1: ["PGW", "Task_X"],
                    t2: ["PGW", "Task_Y"],
                },
            })],
        };

        const caseNumberSetter = jest.fn();
        const wtptSetter = makeWtptSetter();

        const nextFrames = applyBatchFrameUpdates({
            frames,
            batch,
            getNodeType: (elementId) => (elementId === "PGW" ? NodeTypes.PARALLEL_GATEWAY : NodeTypes.TASK),
            caseNumberSetter,
            wtptSetter,
        });

        expect(nextFrames[0].activeElements.t1).toBe("Task_X");
        expect(nextFrames[0].activeElements.t2).toBe("Task_Y");
        expect(caseNumberSetter).not.toHaveBeenCalled();
        expect(wtptSetter).toHaveBeenCalledWith(expect.any(Function));
    });
});

describe("applyBatchFrameUpdatesIfNeeded", () => {
    it("returns original frames when gate is false", () => {
        const frames: FrameCase[] = [{caseId: 1, activeElements: {t1: "Task_A"}}];
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [makeEvent({lifecycle: LifecycleTypes.START})],
        };

        const result = applyBatchFrameUpdatesIfNeeded({
            shouldApply: false,
            frames,
            batch,
            getNodeType: () => NodeTypes.TASK,
            caseNumberSetter: jest.fn(),
            wtptSetter: makeWtptSetter(),
        });

        expect(result).toBe(frames);
    });

    it("applies batch updates when gate is true", () => {
        const frames: FrameCase[] = [];
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [makeEvent({lifecycle: LifecycleTypes.CASE_ARRIVAL, paths: {t1: ["Task_A"]}})],
        };

        const result = applyBatchFrameUpdatesIfNeeded({
            shouldApply: true,
            frames,
            batch,
            getNodeType: () => NodeTypes.TASK,
            caseNumberSetter: jest.fn(),
            wtptSetter: makeWtptSetter(),
        });

        expect(result).toEqual([{caseId: 1, activeElements: {t1: "Task_A"}}]);
    });
});


