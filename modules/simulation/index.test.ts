import axios, {AxiosResponse} from "axios";
import simulation from "@modules/simulation/index";
import {Batch, BatchEvent, WTPTState} from "@definitions/simulation/types";
import {Canvas, ElementRegistry} from "@definitions/simulation/interfaces";
import {LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";
import {FlowTypes} from "@definitions/simulation/enums";
import {SimulationData} from "@definitions/api/types";
import {Dispatch, SetStateAction} from "react";
import {
    buildResumedWTPT,
    buildTimelineResumptionPatch,
    TimelineResumptionPatch,
} from "@modules/simulation/timelineResumptionHelpers";
import {
    calculatePlaybackDelta,
    decidePlaybackSpeedUpdateAction,
    decidePlayPauseResumeAction,
} from "@modules/simulation/playbackStateHelpers";
import {
    computeEmptyBatchWaitTime,
    computeProportionalDelta,
    computeTokenAnimationStartTime,
    groupEventsByCaseId,
    shouldTopUpQueue,
    shouldUpdateFrames,
} from "@modules/simulation/runSimulationHelpers";

jest.mock("axios", () => ({
    post: jest.fn(),
    get: jest.fn(),
}));

jest.mock("@modules/simulation/timelineResumptionHelpers", () => ({
    buildTimelineResumptionPatch: jest.fn(),
    buildResumedWTPT: jest.fn(),
}));

jest.mock("@modules/simulation/playbackStateHelpers", () => ({
    calculatePlaybackDelta: jest.fn(),
    decidePlaybackSpeedUpdateAction: jest.fn(),
    decidePlayPauseResumeAction: jest.fn(),
}));

jest.mock("@modules/simulation/runSimulationHelpers", () => ({
    computeEmptyBatchWaitTime: jest.fn(),
    computeProportionalDelta: jest.fn(),
    computeTokenAnimationStartTime: jest.fn(),
    groupEventsByCaseId: jest.fn(),
    shouldTopUpQueue: jest.fn(),
    shouldUpdateFrames: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedBuildPatch = buildTimelineResumptionPatch as jest.MockedFunction<typeof buildTimelineResumptionPatch>;
const mockedBuildResumedWTPT = buildResumedWTPT as jest.MockedFunction<typeof buildResumedWTPT>;
const mockedDecidePlayPause = decidePlayPauseResumeAction as jest.MockedFunction<typeof decidePlayPauseResumeAction>;
const mockedDecideSpeed = decidePlaybackSpeedUpdateAction as jest.MockedFunction<typeof decidePlaybackSpeedUpdateAction>;
const mockedCalcDelta = calculatePlaybackDelta as jest.MockedFunction<typeof calculatePlaybackDelta>;
const mockedComputeEmptyBatchWaitTime = computeEmptyBatchWaitTime as jest.MockedFunction<typeof computeEmptyBatchWaitTime>;
const mockedComputeProportionalDelta = computeProportionalDelta as jest.MockedFunction<typeof computeProportionalDelta>;
const mockedComputeTokenAnimationStartTime = computeTokenAnimationStartTime as jest.MockedFunction<typeof computeTokenAnimationStartTime>;
const mockedGroupEventsByCaseId = groupEventsByCaseId as jest.MockedFunction<typeof groupEventsByCaseId>;
const mockedShouldTopUpQueue = shouldTopUpQueue as jest.MockedFunction<typeof shouldTopUpQueue>;
const mockedShouldUpdateFrames = shouldUpdateFrames as jest.MockedFunction<typeof shouldUpdateFrames>;

type SimulationPluginInstance = {start?: () => void};
type SimulationPluginDefinition = {
    tokenSimulation: [string, (this: SimulationPluginInstance, canvas: Canvas, elementRegistry: ElementRegistry) => void];
};

function setupDom() {
    document.body.innerHTML = `
      <div id="timeline"></div>
      <div id="progress-bar"></div>
      <div id="pointer"></div>
      <div id="timeline-tooltip"></div>
      <div id="cycle-time-chart-time-bar"></div>
      <div id="simulated-time-box"></div>
      <div id="start-date"></div>
      <div id="end-date"></div>
      <button id="go-to-start-btn"></button>
      <button id="play-pause-btn"></button>
      <button id="go-to-end-btn"></button>
      <select id="speed-select"><option value="2">2</option></select>
    `;

    const timeline = document.getElementById("timeline") as HTMLDivElement;
    Object.defineProperty(timeline, "getBoundingClientRect", {
        value: () => ({left: 0, width: 100, top: 0, right: 100, bottom: 20, height: 20}),
    });
}

function makeSimulationData(overrides: Partial<{
    frames: SimulationData["frames"];
    batches: Batch[];
    pointer: number;
}> = {}): SimulationData {
    return {
        processId: "proc-1",
        frames: overrides.frames ?? [],
        batches: overrides.batches ?? [],
        startDate: "2024-01-01T00:00:00",
        endDate: "2024-01-01T01:00:00",
        file: Buffer.from(""),
        pointer: overrides.pointer ?? 0,
    };
}

function setupPlugin(
    simulationData = makeSimulationData(),
    elementResolver?: (elementId: string) => ReturnType<ElementRegistry["get"]>,
) {
    const state = {ongoing: 0, finished: 0};
    const caseNumberSetterImpl: Dispatch<SetStateAction<{ongoing: number; finished: number}>> = (next) => {
        if (typeof next === "function") {
            const updater = next as (prev: typeof state) => typeof state;
            const updated = updater(state);
            state.ongoing = updated.ongoing;
            state.finished = updated.finished;
            return;
        }
        const updated = next as typeof state;
        state.ongoing = updated.ongoing;
        state.finished = updated.finished;
    };
    const caseNumberSetter = jest.fn(caseNumberSetterImpl);

    const wtptBase: WTPTState = {
        Task_A: {name: "Task A", averageWT: 0, averagePT: 0, _count: 0, incompleteCases: {}},
    };
    const wtptSetterImpl: Dispatch<SetStateAction<WTPTState>> = (updater) => {
        if (typeof updater === "function") {
            (updater as (prev: WTPTState) => WTPTState)(wtptBase);
            return;
        }
    };
    const wtptSetter = jest.fn(wtptSetterImpl);

    const container = document.createElement("div");
    container.innerHTML = `<svg><g data-element-id="root"></g></svg>`;

    const canvas = {
        getContainer: () => container as HTMLDivElement,
    };

    const elementRegistry: ElementRegistry = {
        get: jest.fn((elementId: string) => {
            if (elementResolver) return elementResolver(elementId);
            return {type: NodeTypes.TASK, x: 0, y: 0, width: 10, height: 10};
        }),
    };

    const networkMetricsSetter = jest.fn();
    const pluginDef = simulation(simulationData, caseNumberSetter, wtptSetter, networkMetricsSetter) as unknown as SimulationPluginDefinition;
    const ctor = pluginDef.tokenSimulation[1];
    const instance: SimulationPluginInstance = {};
    ctor.call(instance, canvas, elementRegistry);

    return {instance, caseNumberSetter, wtptSetter, networkMetricsSetter, container, elementRegistry};
}

describe("modules/simulation/index", () => {
    let now = 0;

    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        setupDom();

        now = 0;
        jest.spyOn(performance, "now").mockImplementation(() => {
            now += 16;
            return now;
        });

        global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
            cb(0);
            return 1;
        }) as typeof requestAnimationFrame;

        const postResponse: AxiosResponse = {
            data: {
                frames: [],
                batches: [],
                pointer: 0,
                finishedCasesNumber: 0,
                wtpt: {},
            },
            status: 200,
            statusText: "OK",
            headers: {},
            config: {headers: {}} as never,
        };
        const getResponse: AxiosResponse = {
            data: {batches: [], pointer: 0},
            status: 200,
            statusText: "OK",
            headers: {},
            config: {headers: {}} as never,
        };
        mockedAxios.post.mockResolvedValue(postResponse);
        mockedAxios.get.mockResolvedValue(getResponse);

        mockedBuildPatch.mockReturnValue({
            tokenProgresses: {},
            localProgress: 0,
            batchesQueue: [],
            frames: [],
            batchesPointer: 0,
            caseNumbers: {ongoing: 0, finished: 0},
            shouldUnpause: true,
        } satisfies TimelineResumptionPatch);
        mockedBuildResumedWTPT.mockImplementation((prev) => prev);

        mockedDecidePlayPause.mockReturnValue({kind: "pause"});
        mockedDecideSpeed.mockReturnValue({kind: "paused"});
        mockedCalcDelta.mockReturnValue(1000);

        mockedComputeEmptyBatchWaitTime.mockReturnValue(0);
        mockedComputeProportionalDelta.mockReturnValue(0);
        mockedComputeTokenAnimationStartTime.mockImplementation((startTime, duration, resumed, progress) => {
            if (resumed && typeof progress === "number") return startTime - progress * duration;
            return startTime;
        });
        mockedGroupEventsByCaseId.mockReturnValue({});
        mockedShouldTopUpQueue.mockReturnValue(false);
        mockedShouldUpdateFrames.mockReturnValue(false);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it("starts simulation and marks playback ended when queue is empty", () => {
        const {instance} = setupPlugin(makeSimulationData({batches: []}));

        instance.start?.();

        expect((document.getElementById("play-pause-btn") as HTMLButtonElement).innerHTML).toBe(" ▶");
    });

    it("creates initial frame tokens from active elements", () => {
        const {instance, container} = setupPlugin(makeSimulationData({
            frames: [{caseId: 1, activeElements: {t1: "Task_A"}}],
            batches: [],
        }));

        instance.start?.();

        expect(container.querySelectorAll(".token")).toHaveLength(1);
    });

    it("rewind button requests timeline resumption and applies patch state", async () => {
        const {instance, caseNumberSetter, wtptSetter} = setupPlugin();
        instance.start?.();

        (document.getElementById("go-to-start-btn") as HTMLButtonElement).click();
        await Promise.resolve();

        expect(mockedAxios.post).toHaveBeenCalledTimes(1);
        expect(mockedBuildPatch).toHaveBeenCalledTimes(1);
        expect(caseNumberSetter).toHaveBeenCalledWith({ongoing: 0, finished: 0});
        expect(wtptSetter).toHaveBeenCalled();
        expect((document.getElementById("play-pause-btn") as HTMLButtonElement).innerHTML).toBe("⏸");
    });

    it("removes existing DOM tokens before applying timeline resumption patch", async () => {
        const {instance} = setupPlugin();
        const existingToken = document.createElement("div");
        existingToken.className = "token";
        const removeSpy = jest.spyOn(existingToken, "remove");
        document.body.appendChild(existingToken);

        instance.start?.();
        (document.getElementById("go-to-start-btn") as HTMLButtonElement).click();
        await Promise.resolve();

        expect(removeSpy).toHaveBeenCalled();
    });

    it("keeps play button unchanged when resumption patch does not request unpause", async () => {
        mockedBuildPatch.mockReturnValueOnce({
            tokenProgresses: {},
            localProgress: 0,
            batchesQueue: [],
            frames: [],
            batchesPointer: 0,
            caseNumbers: {ongoing: 0, finished: 0},
            shouldUnpause: false,
        } satisfies TimelineResumptionPatch);

        const {instance} = setupPlugin();
        instance.start?.();

        (document.getElementById("go-to-start-btn") as HTMLButtonElement).click();
        await Promise.resolve();

        expect((document.getElementById("play-pause-btn") as HTMLButtonElement).innerHTML).toBe(" ▶");
    });

    it("handles timeline request errors without throwing", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        mockedAxios.post.mockRejectedValueOnce(new Error("boom"));

        const {instance} = setupPlugin();
        instance.start?.();

        (document.getElementById("go-to-end-btn") as HTMLButtonElement).click();
        await Promise.resolve();

        expect(logSpy).toHaveBeenCalled();
    });

    it("handles play/pause pause branch", () => {
        mockedDecidePlayPause.mockReturnValueOnce({kind: "pause"} as never);

        const {instance} = setupPlugin();
        instance.start?.();

        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();

        expect(mockedDecidePlayPause).toHaveBeenCalled();
        expect((document.getElementById("play-pause-btn") as HTMLButtonElement).innerHTML).toBe(" ▶");
    });

    it("handles play/pause restart branch by requesting progress 0", async () => {
        mockedDecidePlayPause.mockReturnValueOnce({kind: "restart"} as never);

        const {instance} = setupPlugin();
        instance.start?.();

        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();
        await Promise.resolve();

        expect(mockedAxios.post).toHaveBeenCalled();
        const payload = mockedAxios.post.mock.calls[0][1] as {requestedDate: string};
        expect(payload.requestedDate).toContain("2024-01-01T00:00:00");
    });

    it("handles play/pause resume branch and resets token visuals", () => {
        const token = document.createElement("div");
        token.className = "token";
        const removeSpy = jest.spyOn(token, "remove");
        document.body.appendChild(token);

        mockedDecidePlayPause.mockReturnValueOnce({
            kind: "resume",
            nextQueue: [],
            resetPatch: {
                tokens: {},
                coordinateMap: {},
                isResumed: true,
            },
        } as never);

        const {instance} = setupPlugin();
        instance.start?.();

        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();

        expect(removeSpy).toHaveBeenCalled();
        expect((document.getElementById("play-pause-btn") as HTMLButtonElement).innerHTML).toBe("⏸");
    });

    it("updates playback speed in paused branch", () => {
        mockedDecideSpeed.mockReturnValueOnce({kind: "paused"} as never);

        const {instance} = setupPlugin();
        instance.start?.();

        const speedSelect = document.getElementById("speed-select") as HTMLSelectElement;
        speedSelect.value = "2";
        speedSelect.dispatchEvent(new Event("change", {bubbles: true}));

        expect(mockedDecideSpeed).toHaveBeenCalled();
        expect(mockedCalcDelta).toHaveBeenCalledWith(2000, 2);
    });

    it("updates playback speed in running branch after delay and resets token visuals", () => {
        const token = document.createElement("div");
        token.className = "token";
        const removeSpy = jest.spyOn(token, "remove");
        document.body.appendChild(token);

        mockedDecideSpeed.mockReturnValueOnce({
            kind: "running",
            nextQueue: [],
            resetPatch: {
                tokens: {},
                coordinateMap: {},
                isResumed: false,
            },
        } as never);

        const {instance} = setupPlugin();
        instance.start?.();

        const speedSelect = document.getElementById("speed-select") as HTMLSelectElement;
        speedSelect.value = "2";
        speedSelect.dispatchEvent(new Event("change", {bubbles: true}));

        expect(mockedDecideSpeed).toHaveBeenCalled();
        jest.advanceTimersByTime(300);
        expect(removeSpy).toHaveBeenCalled();
        expect(mockedCalcDelta).toHaveBeenCalledWith(2000, 2);
    });

    it("runs non-empty batch branch and groups events by case id", () => {
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [{
                caseId: 1,
                lifecycle: LifecycleTypes.START,
                timestamp: "2024-01-01T00:05:00.000Z",
                nodeId: "Task_A",
                paths: {t1: ["Task_A", "Task_B"]},
            } satisfies BatchEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({});

        const {instance} = setupPlugin(makeSimulationData({batches: [batch]}));
        instance.start?.();

        expect(mockedGroupEventsByCaseId).toHaveBeenCalledWith(batch.events);
    });

    it("handles non-empty grouped events and animates token paths", () => {
        const batchEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {t1: ["Task_A", "Task_B"]},
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [batchEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [batchEvent]});
        mockedComputeProportionalDelta.mockReturnValueOnce(1);

        const {instance, container} = setupPlugin(
            makeSimulationData({batches: [batch]}),
            (elementId) => {
                if (elementId === "flow-1") {
                    return {
                        type: NodeTypes.TASK,
                        x: 0,
                        y: 0,
                        width: 10,
                        height: 10,
                    };
                }

                return {
                    type: NodeTypes.TASK,
                    x: elementId === "Task_A" ? 0 : 40,
                    y: 0,
                    width: 10,
                    height: 10,
                };
            },
        );

        instance.start?.();

        expect(mockedGroupEventsByCaseId).toHaveBeenCalledWith(batch.events);
        expect(container.querySelectorAll(".token").length).toBeGreaterThanOrEqual(1);
    });

    it("warns when a path references a missing element", () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
        const batchEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {
                t1: ["Task_A", "Missing_Element"],
                t2: ["Task_A", "Missing_Element"],
            },
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [batchEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [batchEvent]});

        const {instance} = setupPlugin(
            makeSimulationData({batches: [batch]}),
            (elementId) => {
                if (elementId === "Missing_Element") {
                    return undefined as unknown as ReturnType<ElementRegistry["get"]>;
                }

                return {
                    type: NodeTypes.TASK,
                    x: 0,
                    y: 0,
                    width: 10,
                    height: 10,
                };
            },
        );

        instance.start?.();

        expect(warnSpy).toHaveBeenCalled();
    });

    it("creates async flow-based tokens with fade-in and clears class on animationend", () => {
        const batchEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {
                t1: ["Flow_Start"],
                t2: ["Flow_Start"],
            },
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [batchEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [batchEvent]});

        const {instance, container} = setupPlugin(
            makeSimulationData({batches: [batch]}),
            (elementId) => {
                if (elementId === "Flow_Start") {
                    return {
                        type: FlowTypes.FLOW,
                        waypoints: [{x: 0, y: 0}, {x: 10, y: 0}],
                    } as ReturnType<ElementRegistry["get"]>;
                }

                return {
                    type: NodeTypes.TASK,
                    x: 0,
                    y: 0,
                    width: 10,
                    height: 10,
                };
            },
        );

        instance.start?.();

        const tokens = Array.from(container.querySelectorAll(".token"));
        expect(tokens.length).toBeGreaterThanOrEqual(1);
        expect(tokens.some((token) => token.classList.contains("fade-in"))).toBe(true);

        tokens.forEach((token) => token.dispatchEvent(new Event("animationend")));
        expect(tokens.some((token) => token.classList.contains("fade-in"))).toBe(false);
    });

    it("applies fade-out when CASE_END completes", () => {
        const batchEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.CASE_END,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {t1: ["Task_A", "Task_B"]},
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [batchEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [batchEvent]});

        const {instance, container} = setupPlugin(
            makeSimulationData({
                frames: [{caseId: 1, activeElements: {t1: "Task_A"}}],
                batches: [batch],
            }),
            (elementId) => ({
                type: NodeTypes.TASK,
                x: elementId === "Task_A" ? 0 : 20,
                y: 0,
                width: 10,
                height: 10,
            }),
        );

        instance.start?.();

        expect(container.querySelectorAll(".token").length).toBeGreaterThanOrEqual(1);
    });

    it("merges animation paths when same token appears across sequential batch events", () => {
        const first: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {t1: ["Task_A"]},
        };
        const second: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.COMPLETE,
            timestamp: "2024-01-01T00:06:00.000Z",
            nodeId: "Task_A",
            paths: {t1: ["Task_B"]},
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [first, second],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [first, second]});

        const {instance, container} = setupPlugin(
            makeSimulationData({
                frames: [{caseId: 1, activeElements: {t1: "Task_A"}}],
                batches: [batch],
            }),
            (elementId) => ({
                type: NodeTypes.TASK,
                x: elementId === "Task_A" ? 0 : 30,
                y: 0,
                width: 10,
                height: 10,
            }),
        );

        instance.start?.();

        expect(container.querySelectorAll(".token").length).toBeGreaterThanOrEqual(1);
    });

    it("handles async split-merge recursion through parallel gateway subpaths", () => {
        const asyncEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Gateway",
            paths: {
                t1: ["Task_A", "PGW"],
                t2: ["PGW", "Task_B"],
            },
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [asyncEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [asyncEvent]});

        const {instance, container} = setupPlugin(
            makeSimulationData({batches: [batch]}),
            (elementId) => {
                if (elementId === "PGW") {
                    return {type: NodeTypes.PARALLEL_GATEWAY, x: 10, y: 0, width: 10, height: 10};
                }
                return {
                    type: NodeTypes.TASK,
                    x: elementId === "Task_A" ? 0 : 30,
                    y: 0,
                    width: 10,
                    height: 10,
                };
            },
        );

        instance.start?.();

        expect(container.querySelectorAll(".token").length).toBeGreaterThanOrEqual(1);
    });

    it("reuses stored token color for missing async token in subsequent batch", () => {
        const firstAsync: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Gateway",
            paths: {
                t1: ["Task_A", "PGW"],
                t2: ["PGW", "Task_B"],
            },
        };
        const secondAsync: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:06:00.000Z",
            nodeId: "Gateway",
            paths: {
                t1: ["Task_A", "PGW"],
                t2: ["PGW", "Task_B"],
            },
        };

        mockedGroupEventsByCaseId
            .mockReturnValueOnce({1: [firstAsync]})
            .mockReturnValueOnce({1: [secondAsync]});

        const firstBatch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [firstAsync],
        };
        const secondBatch: Batch = {
            startDate: "2024-01-01T01:00:00.000Z",
            endDate: "2024-01-01T02:00:00.000Z",
            events: [secondAsync],
        };

        const {instance, container} = setupPlugin(
            makeSimulationData({batches: [firstBatch, secondBatch]}),
            (elementId) => {
                if (elementId === "PGW") {
                    return {type: NodeTypes.PARALLEL_GATEWAY, x: 10, y: 0, width: 10, height: 10};
                }
                return {
                    type: NodeTypes.TASK,
                    x: elementId === "Task_A" ? 0 : 30,
                    y: 0,
                    width: 10,
                    height: 10,
                };
            },
        );

        instance.start?.();

        expect(container.querySelectorAll(".token").length).toBeGreaterThanOrEqual(1);
    });

    it("triggers polling top-up when top-up decision is true", async () => {
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [],
        };

        mockedShouldTopUpQueue.mockReturnValueOnce(true);

        const {instance} = setupPlugin(makeSimulationData({batches: [batch], pointer: 10}));
        instance.start?.();

        await Promise.resolve();

        expect(mockedAxios.get).toHaveBeenCalled();
        expect(mockedAxios.get.mock.calls[0][0]).toContain("/api/simulation/proc-1/polling");
    });

    it("logs polling errors and resets fetching state in top-up path", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [],
        };

        mockedShouldTopUpQueue.mockReturnValueOnce(true);
        mockedAxios.get.mockRejectedValueOnce(new Error("polling failed"));

        const {instance} = setupPlugin(makeSimulationData({batches: [batch], pointer: 10}));
        instance.start?.();
        await Promise.resolve();

        expect(logSpy).toHaveBeenCalled();
    });

    it("uses empty-batch wait helper in empty batch branch", () => {
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [],
        };

        mockedComputeProportionalDelta.mockReturnValueOnce(1000);
        mockedComputeEmptyBatchWaitTime.mockReturnValueOnce(0);

        const {instance} = setupPlugin(makeSimulationData({batches: [batch]}));
        instance.start?.();

        expect(mockedComputeEmptyBatchWaitTime).toHaveBeenCalledWith(1000, false, 0);
    });

    it("handles abort in empty-batch wait branch", async () => {
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [],
        };

        mockedComputeEmptyBatchWaitTime.mockReturnValueOnce(5000);
        const clearTimeoutSpy = jest.spyOn(global, "clearTimeout");
        global.requestAnimationFrame = jest.fn(() => 1) as typeof requestAnimationFrame;

        const {instance} = setupPlugin(makeSimulationData({batches: [batch]}));
        instance.start?.();
        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();
        await Promise.resolve();

        expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("handles abort in non-empty batch branch", async () => {
        const batchEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {t1: ["Task_A", "Task_B"]},
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [batchEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [batchEvent]});
        global.requestAnimationFrame = jest.fn(() => 1) as typeof requestAnimationFrame;

        const {instance} = setupPlugin(makeSimulationData({batches: [batch]}));
        instance.start?.();
        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();
        await Promise.resolve();

        expect((document.getElementById("play-pause-btn") as HTMLButtonElement).innerHTML).toBe(" ▶");
    });

    it("applies frame updates and resolves node types from element registry when update condition is true", () => {
        const parallelEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.COMPLETE,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "PGW",
            paths: {
                t1: ["PGW", "Task_A"],
                t2: ["PGW", "Task_B"],
            },
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [parallelEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [parallelEvent]});
        mockedShouldUpdateFrames.mockReturnValueOnce(true);

        const {instance, elementRegistry} = setupPlugin(
            makeSimulationData({
                frames: [{caseId: 1, activeElements: {t1: "PGW", t2: "PGW"}}],
                batches: [batch],
            }),
            (elementId) => ({
                type: elementId === "PGW" ? NodeTypes.PARALLEL_GATEWAY : NodeTypes.TASK,
                x: 0,
                y: 0,
                width: 10,
                height: 10,
            }),
        );

        instance.start?.();

        expect(elementRegistry.get).toHaveBeenCalledWith("PGW");
        expect(elementRegistry.get).toHaveBeenCalledWith("Task_A");
    });

    it("removes token after CASE_END fade-out animation end", () => {
        const batchEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.CASE_END,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {t1: ["Task_A", "Task_B"]},
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [batchEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [batchEvent]});

        const {instance, container} = setupPlugin(
            makeSimulationData({
                frames: [{caseId: 1, activeElements: {t1: "Task_A"}}],
                batches: [batch],
            }),
            (elementId) => ({
                type: NodeTypes.TASK,
                x: elementId === "Task_A" ? 0 : 20,
                y: 0,
                width: 10,
                height: 10,
            }),
        );

        instance.start?.();

        const token = container.querySelector(".token") as SVGCircleElement;
        expect(token.classList.contains("fade-out")).toBe(true);
        token.dispatchEvent(new Event("animationend"));
        expect(container.querySelectorAll(".token")).toHaveLength(0);
    });

    it("reuses stored token colors for resumed async token recreation", () => {
        const resumedAsyncEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Gateway",
            paths: {
                t1: ["Task_A", "PGW"],
                t2: ["PGW", "Task_B"],
            },
        };
        const resumedBatch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [resumedAsyncEvent],
        };

        mockedDecidePlayPause.mockReturnValueOnce({
            kind: "resume",
            nextQueue: [resumedBatch],
            resetPatch: {
                tokens: {},
                coordinateMap: {},
                isResumed: true,
            },
        } as never);
        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [resumedAsyncEvent]});
        mockedComputeProportionalDelta.mockReturnValueOnce(1);

        const {instance, container} = setupPlugin(
            makeSimulationData({
                frames: [{caseId: 1, activeElements: {t2: "Task_A"}}],
                batches: [],
            }),
            (elementId) => {
                if (elementId === "PGW") {
                    return {type: NodeTypes.PARALLEL_GATEWAY, x: 10, y: 0, width: 10, height: 10};
                }
                return {
                    type: NodeTypes.TASK,
                    x: elementId === "Task_A" ? 0 : 30,
                    y: 0,
                    width: 10,
                    height: 10,
                };
            },
        );

        instance.start?.();
        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();
        jest.advanceTimersByTime(10);

        expect(container.querySelectorAll(".token").length).toBeGreaterThanOrEqual(1);
    });

    it("skips fade-in for resumed async token recreation when token progress already exists", () => {
        const initialAsyncEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Gateway",
            paths: {
                t1: ["Task_A", "PGW"],
                t2: ["PGW", "Task_B"],
            },
        };
        const resumedAsyncEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:06:00.000Z",
            nodeId: "Gateway",
            paths: {
                t1: ["Task_A", "PGW"],
                t2: ["PGW", "Task_B"],
            },
        };

        mockedGroupEventsByCaseId
            .mockReturnValueOnce({1: [initialAsyncEvent]})
            .mockReturnValueOnce({1: [resumedAsyncEvent]});

        mockedDecidePlayPause.mockReturnValueOnce({
            kind: "resume",
            nextQueue: [{
                startDate: "2024-01-01T01:00:00.000Z",
                endDate: "2024-01-01T02:00:00.000Z",
                events: [resumedAsyncEvent],
            }],
            resetPatch: {
                tokens: {},
                coordinateMap: {},
                isResumed: true,
            },
        } as never);

        const {instance, container} = setupPlugin(
            makeSimulationData({
                batches: [{
                    startDate: "2024-01-01T00:00:00.000Z",
                    endDate: "2024-01-01T01:00:00.000Z",
                    events: [initialAsyncEvent],
                }],
            }),
            (elementId) => {
                if (elementId === "PGW") {
                    return {type: NodeTypes.PARALLEL_GATEWAY, x: 10, y: 0, width: 10, height: 10};
                }
                return {
                    type: NodeTypes.TASK,
                    x: elementId === "Task_A" ? 0 : 30,
                    y: 0,
                    width: 10,
                    height: 10,
                };
            },
        );

        instance.start?.();
        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();
        jest.advanceTimersByTime(10);

        const tokens = Array.from(container.querySelectorAll(".token"));
        expect(tokens.length).toBeGreaterThanOrEqual(1);
        expect(tokens.some((token) => token.classList.contains("fade-in"))).toBe(false);
    });

    it("skips fade-in for resumed non-async token recreation with saved token progress", async () => {
        const resumedEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.COMPLETE,
            timestamp: "2024-01-01T00:06:00.000Z",
            nodeId: "Task_B",
            paths: {t1: ["Task_B", "Task_C"]},
        };

        mockedBuildPatch.mockReturnValueOnce({
            tokenProgresses: {1: {t1: 0.5}},
            localProgress: 0.2,
            batchesQueue: [],
            frames: [],
            batchesPointer: 0,
            caseNumbers: {ongoing: 1, finished: 0},
            shouldUnpause: false,
        } satisfies TimelineResumptionPatch);

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [resumedEvent]});

        mockedDecidePlayPause.mockReturnValueOnce({
            kind: "resume",
            nextQueue: [{
                startDate: "2024-01-01T01:00:00.000Z",
                endDate: "2024-01-01T02:00:00.000Z",
                events: [resumedEvent],
            }],
            resetPatch: {
                tokens: {},
                coordinateMap: {},
                isResumed: true,
            },
        } as never);

        const {instance, container} = setupPlugin(
            makeSimulationData({
                batches: [],
            }),
            () => ({type: NodeTypes.TASK, x: 0, y: 0, width: 10, height: 10}),
        );

        instance.start?.();
        (document.getElementById("go-to-start-btn") as HTMLButtonElement).click();
        await Promise.resolve();
        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();
        jest.advanceTimersByTime(10);

        const token = container.querySelector(".token");
        expect(token).toBeTruthy();
        expect(token?.classList.contains("fade-in")).toBe(false);
    });

    it("uses resumed local-progress branch for non-async empty-path events", () => {
        const resumedEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {},
        };
        const resumedBatch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [resumedEvent],
        };

        mockedDecidePlayPause.mockReturnValueOnce({
            kind: "resume",
            nextQueue: [resumedBatch],
            resetPatch: {
                tokens: {},
                coordinateMap: {},
                isResumed: true,
            },
        } as never);
        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [resumedEvent]});
        mockedComputeProportionalDelta.mockReturnValueOnce(1000);

        const timeoutSpy = jest.spyOn(global, "setTimeout");
        const {instance} = setupPlugin(makeSimulationData({batches: []}));

        instance.start?.();
        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();
        jest.advanceTimersByTime(10);

        expect(timeoutSpy).toHaveBeenCalled();
    });

    it("creates resumed non-async token with saved progress state", async () => {
        const patchWithProgress: TimelineResumptionPatch = {
            tokenProgresses: {1: {t1: 0.6}},
            localProgress: 0.4,
            batchesQueue: [{
                startDate: "2024-01-01T00:00:00.000Z",
                endDate: "2024-01-01T01:00:00.000Z",
                events: [{
                    caseId: 1,
                    lifecycle: LifecycleTypes.START,
                    timestamp: "2024-01-01T00:05:00.000Z",
                    nodeId: "Task_A",
                    paths: {t1: ["Task_A", "Task_B"]},
                }],
            }],
            frames: [],
            batchesPointer: 1,
            caseNumbers: {ongoing: 1, finished: 0},
            shouldUnpause: true,
        };

        mockedBuildPatch.mockReturnValueOnce(patchWithProgress);
        mockedComputeProportionalDelta.mockReturnValue(1);
        mockedGroupEventsByCaseId.mockReturnValueOnce({
            1: patchWithProgress.batchesQueue[0].events,
        });

        const {instance, container} = setupPlugin(makeSimulationData(), (elementId) => ({
            type: NodeTypes.TASK,
            x: elementId === "Task_A" ? 0 : 20,
            y: 0,
            width: 10,
            height: 10,
        }));

        instance.start?.();
        (document.getElementById("go-to-start-btn") as HTMLButtonElement).click();
        await Promise.resolve();
        jest.advanceTimersByTime(10);

        expect(mockedComputeTokenAnimationStartTime).toHaveBeenCalled();
        expect(container.querySelectorAll(".token").length).toBeGreaterThanOrEqual(1);
    });

    it("re-enters animateTimeline with resumed local progress", () => {
        const emptyBatch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [],
        };

        let rafCalls = 0;
        global.requestAnimationFrame = ((cb: FrameRequestCallback) => {
            rafCalls += 1;
            if (rafCalls === 1) cb(0);
            return rafCalls;
        }) as typeof requestAnimationFrame;

        mockedDecidePlayPause.mockReturnValueOnce({
            kind: "resume",
            nextQueue: [emptyBatch],
            resetPatch: {
                tokens: {},
                coordinateMap: {},
                isResumed: true,
            },
        } as never);

        const {instance} = setupPlugin(makeSimulationData({batches: [emptyBatch]}));
        instance.start?.();

        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();
        jest.advanceTimersByTime(10);

        expect(rafCalls).toBeGreaterThan(1);
    });

    it("updates timeline progress during drag and requests resumption on drag end", async () => {
        const {instance} = setupPlugin();
        instance.start?.();

        const timeline = document.getElementById("timeline") as HTMLDivElement;
        const progressBar = document.getElementById("progress-bar") as HTMLDivElement;
        const pointer = document.getElementById("pointer") as HTMLDivElement;

        timeline.dispatchEvent(new MouseEvent("mousedown", {clientX: 30, bubbles: true}));
        document.dispatchEvent(new MouseEvent("mousemove", {clientX: 70, bubbles: true}));
        document.dispatchEvent(new MouseEvent("mouseup", {clientX: 70, bubbles: true}));
        await Promise.resolve();

        expect(progressBar.style.width).toBe("70%");
        expect(pointer.style.left).toBe("70%");
        expect(mockedAxios.post).toHaveBeenCalled();
    });

    it("updates timeline progress via touch drag and requests resumption on touch end", async () => {
        const {instance} = setupPlugin();
        instance.start?.();

        const timeline = document.getElementById("timeline") as HTMLDivElement;
        const progressBar = document.getElementById("progress-bar") as HTMLDivElement;
        const pointer = document.getElementById("pointer") as HTMLDivElement;

        const touchStart = new Event("touchstart", {bubbles: true}) as TouchEvent;
        Object.defineProperty(touchStart, "touches", {value: [{clientX: 25}]});
        timeline.dispatchEvent(touchStart);

        const touchMove = new Event("touchmove", {bubbles: true}) as TouchEvent;
        Object.defineProperty(touchMove, "touches", {value: [{clientX: 80}]});
        document.dispatchEvent(touchMove);

        const touchEnd = new Event("touchend", {bubbles: true}) as TouchEvent;
        Object.defineProperty(touchEnd, "changedTouches", {value: [{clientX: 80}]});
        document.dispatchEvent(touchEnd);
        await Promise.resolve();

        expect(progressBar.style.width).toBe("80%");
        expect(pointer.style.left).toBe("80%");
        expect(mockedAxios.post).toHaveBeenCalled();
    });

    it("handles flow elements with empty waypoints without placing a token", () => {
        const {instance, container} = setupPlugin(makeSimulationData({
            frames: [{caseId: 1, activeElements: {t1: "Flow_No_Waypoints"}}],
            batches: [],
        }), (elementId) => {
            if (elementId === "Flow_No_Waypoints") {
                return {
                    type: FlowTypes.FLOW,
                    waypoints: [],
                } as ReturnType<ElementRegistry["get"]>;
            }

            return {
                type: NodeTypes.TASK,
                x: 0,
                y: 0,
                width: 10,
                height: 10,
            };
        });

        instance.start?.();

        expect(container.querySelectorAll(".token")).toHaveLength(0);
    });

    it("keeps coordinate cleanup stable when previous token lookup index is not found", () => {
        const indexOfSpy = jest.spyOn(Array.prototype, "indexOf").mockImplementationOnce(() => -1);
        const batchEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {t1: ["Task_B"]},
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [batchEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [batchEvent]});
        mockedComputeProportionalDelta.mockReturnValueOnce(1000);

        const {instance, container} = setupPlugin(
            makeSimulationData({
                frames: [{caseId: 1, activeElements: {t1: "Task_A"}}],
                batches: [batch],
            }),
            (elementId) => ({
                type: NodeTypes.TASK,
                x: elementId === "Task_A" ? 0 : 0.1,
                y: 0,
                width: 10,
                height: 10,
            }),
        );

        expect(() => instance.start?.()).not.toThrow();
        expect(indexOfSpy).toHaveBeenCalled();
        expect(container.querySelectorAll(".token").length).toBeGreaterThanOrEqual(1);
    });

    it("reuses existing token in non-async path without recreating it", () => {
        const batchEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.COMPLETE,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {t1: ["Task_B"]},
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [batchEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [batchEvent]});

        const {instance, container} = setupPlugin(
            makeSimulationData({
                frames: [{caseId: 1, activeElements: {t1: "Task_A"}}],
                batches: [batch],
            }),
            (elementId) => ({
                type: NodeTypes.TASK,
                x: elementId === "Task_A" ? 0 : 30,
                y: 0,
                width: 10,
                height: 10,
            }),
        );

        instance.start?.();

        expect(container.querySelectorAll(".token")).toHaveLength(1);
        expect(mockedComputeTokenAnimationStartTime).toHaveBeenCalled();
    });

    it("waits for non-async batch events with empty paths", () => {
        const emptyPathEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {},
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [emptyPathEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [emptyPathEvent]});
        mockedComputeProportionalDelta.mockReturnValueOnce(500);

        const {instance} = setupPlugin(makeSimulationData({batches: [batch]}));

        instance.start?.();

        expect(mockedGroupEventsByCaseId).toHaveBeenCalledWith(batch.events);
    });

    it("avoids re-entrant polling fetch while a previous top-up request is still in flight", async () => {
        const batch1: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [],
        };
        const batch2: Batch = {
            startDate: "2024-01-01T01:00:00.000Z",
            endDate: "2024-01-01T02:00:00.000Z",
            events: [],
        };

        mockedShouldTopUpQueue.mockReturnValue(true);
        let resolveGet: ((value: AxiosResponse) => void) | undefined;
        const inFlightGet = new Promise<AxiosResponse>((resolve) => {
            resolveGet = resolve;
        });
        mockedAxios.get.mockReturnValueOnce(inFlightGet);

        const {instance} = setupPlugin(makeSimulationData({batches: [batch1, batch2], pointer: 4}));
        instance.start?.();

        await Promise.resolve();
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);

        resolveGet?.({
            data: {batches: [], pointer: 4},
            status: 200,
            statusText: "OK",
            headers: {},
            config: {headers: {}} as never,
        });
        await Promise.resolve();
    });

    it("returns early from timeline animation frame when aborted", () => {
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [],
        };

        let queuedFrame: FrameRequestCallback | undefined;
        global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
            queuedFrame = cb;
            return 1;
        }) as typeof requestAnimationFrame;

        mockedComputeEmptyBatchWaitTime.mockReturnValueOnce(5000);

        const {instance} = setupPlugin(makeSimulationData({batches: [batch]}));
        instance.start?.();

        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();
        queuedFrame?.(0);

        expect((global.requestAnimationFrame as jest.Mock)).toHaveBeenCalled();
    });

    it("returns at runSimulation loop top when aborted before delayed resume run starts", () => {
        const queuedBatch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [],
        };

        mockedDecidePlayPause
            .mockReturnValueOnce({
                kind: "resume",
                nextQueue: [queuedBatch],
                resetPatch: {
                    tokens: {},
                    coordinateMap: {},
                    isResumed: true,
                },
            } as never)
            .mockReturnValueOnce({kind: "pause"} as never);

        const {instance} = setupPlugin(makeSimulationData({batches: []}));
        instance.start?.();

        const playPause = document.getElementById("play-pause-btn") as HTMLButtonElement;
        playPause.click();
        playPause.click();
        jest.advanceTimersByTime(10);

        expect(mockedComputeProportionalDelta).not.toHaveBeenCalled();
        expect(playPause.innerHTML).toBe(" ▶");
    });

    it("keeps polling to a single request when repeated top-up checks happen during in-flight fetch", async () => {
        const batches: Batch[] = [
            {startDate: "2024-01-01T00:00:00.000Z", endDate: "2024-01-01T01:00:00.000Z", events: []},
            {startDate: "2024-01-01T01:00:00.000Z", endDate: "2024-01-01T02:00:00.000Z", events: []},
            {startDate: "2024-01-01T02:00:00.000Z", endDate: "2024-01-01T03:00:00.000Z", events: []},
        ];

        mockedShouldTopUpQueue.mockReturnValue(true);
        mockedComputeEmptyBatchWaitTime.mockReturnValue(0);

        let resolveGet: ((value: AxiosResponse) => void) | undefined;
        const pendingGet = new Promise<AxiosResponse>((resolve) => {
            resolveGet = resolve;
        });
        mockedAxios.get.mockReturnValueOnce(pendingGet);

        const {instance} = setupPlugin(makeSimulationData({batches, pointer: 100}));
        instance.start?.();
        jest.runAllTimers();
        await Promise.resolve();

        expect(mockedAxios.get).toHaveBeenCalledTimes(1);

        resolveGet?.({
            data: {batches: [], pointer: 100},
            status: 200,
            statusText: "OK",
            headers: {},
            config: {headers: {}} as never,
        });
    });

    it("short-circuits async token animation when token is already marked animated", () => {
        const hasSpy = jest.spyOn(Set.prototype, "has").mockImplementation(() => true);
        const asyncEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Gateway",
            paths: {
                t1: ["Task_A", "PGW"],
                t2: ["PGW", "Task_B"],
            },
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [asyncEvent]});

        const {instance} = setupPlugin(
            makeSimulationData({
                batches: [{
                    startDate: "2024-01-01T00:00:00.000Z",
                    endDate: "2024-01-01T01:00:00.000Z",
                    events: [asyncEvent],
                }],
            }),
            (elementId) => {
                if (elementId === "PGW") {
                    return {type: NodeTypes.PARALLEL_GATEWAY, x: 10, y: 0, width: 10, height: 10};
                }
                return {
                    type: NodeTypes.TASK,
                    x: elementId === "Task_A" ? 0 : 30,
                    y: 0,
                    width: 10,
                    height: 10,
                };
            },
        );

        expect(() => instance.start?.()).not.toThrow();
        expect(hasSpy).toHaveBeenCalled();
    });

    it("exits token animation frame immediately when aborted", () => {
        const queuedFrames: FrameRequestCallback[] = [];
        global.requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
            queuedFrames.push(cb);
            return queuedFrames.length;
        }) as typeof requestAnimationFrame;

        const batchEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {t1: ["Task_A", "Task_B"]},
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [batchEvent]});

        const {instance} = setupPlugin(
            makeSimulationData({
                frames: [{caseId: 1, activeElements: {t1: "Task_A"}}],
                batches: [{
                    startDate: "2024-01-01T00:00:00.000Z",
                    endDate: "2024-01-01T01:00:00.000Z",
                    events: [batchEvent],
                }],
            }),
            (elementId) => ({
                type: NodeTypes.TASK,
                x: elementId === "Task_A" ? 0 : 20,
                y: 0,
                width: 10,
                height: 10,
            }),
        );

        instance.start?.();
        const beforeAbortRafCalls = (global.requestAnimationFrame as jest.Mock).mock.calls.length;
        (document.getElementById("play-pause-btn") as HTMLButtonElement).click();
        queuedFrames.forEach((callback) => callback(0));

        expect((global.requestAnimationFrame as jest.Mock).mock.calls.length).toBe(beforeAbortRafCalls);
    });

    it("continues empty-batch loop when a non-abort error happens", () => {
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [],
        };

        mockedComputeProportionalDelta.mockReturnValueOnce(1000);
        mockedComputeEmptyBatchWaitTime.mockImplementationOnce(() => {
            throw new Error("unexpected wait error");
        });

        const {instance} = setupPlugin(makeSimulationData({batches: [batch]}));
        expect(() => instance.start?.()).not.toThrow();
        expect(mockedComputeEmptyBatchWaitTime).toHaveBeenCalled();
    });

    it("continues non-empty batch loop when batch handling throws a non-abort error", () => {
        const batchEvent: BatchEvent = {
            caseId: 1,
            lifecycle: LifecycleTypes.START,
            timestamp: "2024-01-01T00:05:00.000Z",
            nodeId: "Task_A",
            paths: {t1: ["Task_A"]},
        };
        const batch: Batch = {
            startDate: "2024-01-01T00:00:00.000Z",
            endDate: "2024-01-01T01:00:00.000Z",
            events: [batchEvent],
        };

        mockedGroupEventsByCaseId.mockReturnValueOnce({1: [batchEvent]});
        mockedShouldUpdateFrames.mockReturnValueOnce(true);

        const {instance} = setupPlugin(
            makeSimulationData({batches: [batch]}),
            () => undefined as unknown as ReturnType<ElementRegistry["get"]>,
        );

        expect(() => instance.start?.()).not.toThrow();
        expect(mockedGroupEventsByCaseId).toHaveBeenCalledWith(batch.events);
    });

    it("shows and hides timeline tooltip on hover", () => {
        const {instance} = setupPlugin();
        instance.start?.();

        const timeline = document.getElementById("timeline") as HTMLDivElement;
        const tooltip = document.getElementById("timeline-tooltip") as HTMLDivElement;

        timeline.dispatchEvent(new MouseEvent("mousemove", {
            clientX: 50,
            clientY: 50,
            bubbles: true,
        }));

        expect(tooltip.style.display).toBe("block");
        expect(tooltip.textContent).toBeTruthy();

        timeline.dispatchEvent(new MouseEvent("mouseleave", {bubbles: true}));
        expect(tooltip.style.display).toBe("none");
    });
});

