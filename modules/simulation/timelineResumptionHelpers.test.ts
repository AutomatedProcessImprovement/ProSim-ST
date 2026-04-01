import {ResumeSimulationResponse} from "@definitions/api/types";
import {WTPTState} from "@definitions/simulation/types";
import {buildResumedWTPT, buildTimelineResumptionPatch} from "@modules/simulation/timelineResumptionHelpers";

function makeResponse(overrides: Partial<ResumeSimulationResponse> = {}): ResumeSimulationResponse {
    return {
        frames: [{caseId: 10, activeElements: {t1: "Task_A"}}],
        batches: [{startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-01-01T01:00:00.000Z", events: []}],
        pointer: 123,
        finishedCasesNumber: 7,
        wtpt: {
            Task_A: {
                name: "Task_A",
                averageWT: 100,
                averagePT: 200,
                _count: 2,
                incompleteCases: {},
            },
        },
        ...overrides,
    };
}

function makeBaseWTPT(): WTPTState {
    return {
        Task_A: {
            name: "Task One",
            averageWT: 0,
            averagePT: 0,
            _count: 0,
            incompleteCases: {},
        },
        Task_B: {
            name: "Task Two",
            averageWT: 0,
            averagePT: 0,
            _count: 0,
            incompleteCases: {},
        },
    };
}

describe("buildTimelineResumptionPatch", () => {
    it("builds deterministic runtime patch from resumption response", () => {
        const response = makeResponse();
        const patch = buildTimelineResumptionPatch(response, true);

        expect(patch.localProgress).toBe(0);
        expect(patch.tokenProgresses).toEqual({});
        expect(patch.batchesQueue).toBe(response.batches);
        expect(patch.frames).toEqual(response.frames);
        expect(patch.frames).not.toBe(response.frames);
        expect(patch.batchesPointer).toBe(123);
        expect(patch.caseNumbers).toEqual({ongoing: 1, finished: 7});
        expect(patch.shouldUnpause).toBe(true);
    });

    it("keeps paused flag false when simulation is already running", () => {
        const patch = buildTimelineResumptionPatch(makeResponse(), false);
        expect(patch.shouldUnpause).toBe(false);
    });
});

describe("buildResumedWTPT", () => {
    it("hydrates incoming stats with stable task names and resets missing tasks", () => {
        const incoming = makeResponse({
            wtpt: {
                Task_A: {
                    name: "overwritten",
                    averageWT: 22,
                    averagePT: 33,
                    _count: 4,
                    incompleteCases: {},
                },
                Unknown_Task: {
                    name: "Unknown",
                    averageWT: 1,
                    averagePT: 2,
                    _count: 1,
                    incompleteCases: {},
                },
            },
        }).wtpt;

        const hydrated = buildResumedWTPT(makeBaseWTPT(), incoming);

        expect(hydrated.Task_A.name).toBe("Task One");
        expect(hydrated.Task_A.averageWT).toBe(22);
        expect(hydrated.Task_B).toEqual({
            name: "Task Two",
            averageWT: 0,
            averagePT: 0,
            _count: 0,
            incompleteCases: {},
        });
        expect(hydrated.Unknown_Task).toBeUndefined();
    });
});

