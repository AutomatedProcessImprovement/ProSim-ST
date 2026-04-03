import {LifecycleTypes} from "@definitions/simulation/enums";
import {BatchEvent, WTPTState} from "@definitions/simulation/types";
import {hydrateWTPTNames, setNewWTPTState} from "@modules/simulation/wtptHelpers";

function makeBatchEvent(overrides: Partial<BatchEvent>): BatchEvent {
    return {
        caseId: 1,
        lifecycle: LifecycleTypes.ENABLE,
        timestamp: "2024-01-01T09:00:00.000Z",
        nodeId: "Task_A",
        paths: {},
        ...overrides,
    };
}

function makeState(): WTPTState {
    return {
        Task_A: {
            name: "Task A",
            averageWT: 0,
            averagePT: 0,
            _count: 0,
            incompleteCases: {},
        },
        Task_B: {
            name: "Task B",
            averageWT: 0,
            averagePT: 0,
            _count: 0,
            incompleteCases: {},
        },
    };
}

describe("setNewWTPTState", () => {
    it("ignores unsupported lifecycle transitions", () => {
        const previous = makeState();
        const next = setNewWTPTState(previous, makeBatchEvent({lifecycle: LifecycleTypes.CASE_END}));
        expect(next).toBe(previous);
    });

    it("returns previous state when node does not exist in WTPT map", () => {
        const previous = makeState();
        const next = setNewWTPTState(previous, makeBatchEvent({nodeId: "Unknown_Task"}));
        expect(next).toBe(previous);
    });

    it("records ENABLE and START, then finalizes averages on COMPLETE", () => {
        const enabled = setNewWTPTState(makeState(), makeBatchEvent({
            lifecycle: LifecycleTypes.ENABLE,
            timestamp: "2024-01-01T09:00:00.000Z",
        }));

        const started = setNewWTPTState(enabled, makeBatchEvent({
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T09:30:00.000Z",
        }));

        const completed = setNewWTPTState(started, makeBatchEvent({
            lifecycle: LifecycleTypes.COMPLETE,
            timestamp: "2024-01-01T10:30:00.000Z",
        }));

        expect(completed.Task_A.averageWT).toBe(30 * 60 * 1000);
        expect(completed.Task_A.averagePT).toBe(60 * 60 * 1000);
        expect(completed.Task_A._count).toBe(1);
        expect(completed.Task_A.incompleteCases[1]).toBeUndefined();
    });

    it("does not accept START/COMPLETE without ENABLE", () => {
        const previous = makeState();
        const started = setNewWTPTState(previous, makeBatchEvent({lifecycle: LifecycleTypes.START}));
        const completed = setNewWTPTState(previous, makeBatchEvent({lifecycle: LifecycleTypes.COMPLETE}));

        expect(started).toBe(previous);
        expect(completed).toBe(previous);
    });

    it("ignores COMPLETE when ENABLE exists but START is missing", () => {
        const withEnableOnly: WTPTState = {
            ...makeState(),
            Task_A: {
                ...makeState().Task_A,
                incompleteCases: {
                    1: {
                        enablementTime: new Date("2024-01-01T09:00:00.000Z").getTime(),
                    },
                },
            },
        };

        const next = setNewWTPTState(withEnableOnly, makeBatchEvent({
            lifecycle: LifecycleTypes.COMPLETE,
            timestamp: "2024-01-01T10:00:00.000Z",
        }));

        expect(next).toBe(withEnableOnly);
    });

    it("keeps previous state for invalid out-of-order timestamps", () => {
        const withCase = {
            ...makeState(),
            Task_A: {
                ...makeState().Task_A,
                incompleteCases: {
                    1: {
                        enablementTime: new Date("2024-01-01T10:00:00.000Z").getTime(),
                        startTime: new Date("2024-01-01T09:00:00.000Z").getTime(),
                    },
                },
            },
        };

        const next = setNewWTPTState(withCase, makeBatchEvent({
            lifecycle: LifecycleTypes.COMPLETE,
            timestamp: "2024-01-01T11:00:00.000Z",
        }));

        expect(next).toBe(withCase);
    });

    it("uses count fallback when _count is missing", () => {
        const previous = makeState();
        delete (previous.Task_A as unknown as Record<string, unknown>)._count;
        previous.Task_A.incompleteCases[1] = {
            enablementTime: new Date("2024-01-01T09:00:00.000Z").getTime(),
            startTime: new Date("2024-01-01T09:30:00.000Z").getTime(),
        };

        const next = setNewWTPTState(previous, makeBatchEvent({
            lifecycle: LifecycleTypes.COMPLETE,
            timestamp: "2024-01-01T10:30:00.000Z",
        }));

        expect(next.Task_A._count).toBe(1);
        expect(next.Task_A.averageWT).toBe(30 * 60 * 1000);
    });
});

describe("hydrateWTPTNames", () => {
    it("preserves base names and resets missing nodes", () => {
        const base = makeState();
        const incoming: WTPTState = {
            Task_A: {
                name: "overwritten",
                averageWT: 100,
                averagePT: 200,
                _count: 3,
                incompleteCases: {},
            },
            Unknown_Task: {
                name: "Unknown",
                averageWT: 999,
                averagePT: 999,
                _count: 1,
                incompleteCases: {},
            },
        };

        const hydrated = hydrateWTPTNames(base, incoming);

        expect(hydrated.Task_A.name).toBe("Task A");
        expect(hydrated.Task_A.averageWT).toBe(100);
        expect(hydrated.Task_B).toEqual({
            name: "Task B",
            averageWT: 0,
            averagePT: 0,
            _count: 0,
            incompleteCases: {},
        });
        expect(hydrated.Unknown_Task).toBeUndefined();
    });
});

