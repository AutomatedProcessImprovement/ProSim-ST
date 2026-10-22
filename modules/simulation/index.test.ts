import axios from "axios";
import simulation from "@modules/simulation/index";
import {Batch, BatchEvent, FrameCase, SimulationHooks, TokenSimulationApi, WTPTState} from "@definitions/simulation/types";
import {Canvas, ElementRegistry, EventBus} from "@definitions/simulation/interfaces";
import {FlowTypes, LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";
import {SimulationData} from "@definitions/api/types";
import {STATE_COLORS, AGE_COLORS} from "@modules/simulation/restLayout";

jest.mock("axios", () => ({
    post: jest.fn(),
    get: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

// start -> Task_A -> split P -> Task_B / Task_C -> join J -> end
const shapes = {
    Start: {type: NodeTypes.START_EVENT, x: 0, y: 20, width: 36, height: 36},
    Task_A: {type: NodeTypes.TASK, x: 100, y: 0, width: 100, height: 80, businessObject: {name: "Check form"}},
    P: {type: NodeTypes.PARALLEL_GATEWAY, x: 250, y: 15, width: 50, height: 50},
    Task_B: {type: NodeTypes.TASK, x: 400, y: -140, width: 100, height: 80, businessObject: {name: "Check credit"}},
    Task_C: {type: NodeTypes.TASK, x: 400, y: 140, width: 100, height: 80, businessObject: {name: "Appraise"}},
    J: {type: NodeTypes.PARALLEL_GATEWAY, x: 575, y: 15, width: 50, height: 50},
    End: {type: NodeTypes.END_EVENT, x: 700, y: 22, width: 36, height: 36},
};
const flow = (target: keyof typeof shapes, waypoints: Array<[number, number]>) => ({
    type: FlowTypes.FLOW,
    waypoints: waypoints.map(([x, y]) => ({x, y})),
    target: {id: target, type: shapes[target].type},
});
const flows = {
    Flow_S_A: flow("Task_A", [[36, 38], [100, 38]]),
    Flow_A_P: flow("P", [[200, 40], [250, 40]]),
    Flow_P_B: flow("Task_B", [[275, 15], [275, -100], [400, -100]]),
    Flow_P_C: flow("Task_C", [[275, 65], [275, 180], [400, 180]]),
    Flow_B_J: flow("J", [[500, -100], [600, -100], [600, 15]]),
    Flow_C_J: flow("J", [[500, 180], [600, 180], [600, 65]]),
    Flow_J_E: flow("End", [[625, 40], [700, 40]]),
};

const HOUR = 3600000;
const START = Date.UTC(2024, 0, 1, 0, 0, 0);
const iso = (hours: number) => new Date(START + hours * HOUR).toISOString();
const stamp = (hours: number) => iso(hours).slice(0, 19).replace("T", " ");

const event = (caseId: number, lifecycle: LifecycleTypes, hours: number, nodeId: string, paths: BatchEvent["paths"] = {}): BatchEvent =>
    ({caseId, lifecycle, timestamp: stamp(hours), nodeId, paths});

const batch = (hour: number, events: BatchEvent[] = []): Batch => ({startDate: iso(hour), endDate: iso(hour + 1), events});

const emptyBatches = (from: number, to: number) => Array.from({length: to - from}, (_, i) => batch(from + i));

function setupDom() {
    document.body.innerHTML = `
      <div id="timeline"></div>
      <div id="progress-bar"></div>
      <div id="pointer"></div>
      <div id="timeline-tooltip"></div>
      <div id="token-tooltip"></div>
      <div id="cycle-time-chart-time-bar"></div>
      <div id="simulated-time-box"></div>
      <div id="start-date"></div>
      <div id="end-date"></div>
      <button id="go-to-start-btn"></button>
      <button id="play-pause-btn"></button>
      <button id="go-to-end-btn"></button>
      <select id="speed-select"><option value="1">1</option><option value="24">24</option></select>
    `;
    Object.defineProperty(document.getElementById("timeline"), "getBoundingClientRect", {
        value: () => ({left: 0, width: 100, top: 0, right: 100, bottom: 20, height: 20}),
    });
}

// Animation frames and the clock are driven by the tests
let clock = 0;
let frameCallbacks: FrameRequestCallback[] = [];

const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
};

async function play(ms: number, step = 50) {
    for (let elapsed = 0; elapsed < ms; elapsed += step) {
        clock += step;
        const callbacks = frameCallbacks;
        frameCallbacks = [];
        callbacks.forEach(callback => callback(clock));
        jest.advanceTimersByTime(step);
        await flush();
    }
}

function setup({
    frames = [],
    batches = [],
    pointer = -1,
    endHours = 6,
    hooks = {},
}: {frames?: FrameCase[]; batches?: Batch[]; pointer?: number; endHours?: number; hooks?: SimulationHooks} = {}) {
    const container = document.createElement("div");
    container.innerHTML = `<svg><g data-element-id="root"></g></svg>`;
    document.body.appendChild(container);

    const graphics: Record<string, SVGGElement> = {};
    Object.keys(shapes).forEach(id => {
        const gfx = document.createElementNS("http://www.w3.org/2000/svg", "g");
        gfx.innerHTML = `<g class="djs-visual"><rect style="fill: white"></rect></g>`;
        graphics[id] = gfx;
    });

    const elementRegistry: ElementRegistry = {
        get: (id: string) => (shapes[id] ? {id, ...shapes[id]} : flows[id] ? {id, ...flows[id]} : undefined) as never,
        getGraphics: (id: string) => graphics[id],
    };
    const busHandlers: Record<string, Array<(event: unknown) => void>> = {};
    const eventBus: EventBus = {
        on: (name, callback) => { (busHandlers[name] ??= []).push(callback as never); },
    };

    const counters = {ongoing: frames.length, finished: 0};
    const caseNumberSetter = jest.fn(next => Object.assign(counters, typeof next === "function" ? next(counters) : next));
    let wtpt: WTPTState = {};
    const wtptSetter = jest.fn(next => { wtpt = typeof next === "function" ? next(wtpt) : next; });

    const simulationData: SimulationData = {
        processId: "p1",
        frames,
        batches,
        startDate: iso(0).slice(0, 19),
        endDate: iso(endHours).slice(0, 19),
        utcOffset: "+00:00",
        file: Buffer.from(""),
        pointer,
    };
    const pluginDef = simulation(simulationData, caseNumberSetter, wtptSetter, jest.fn(), jest.fn(), hooks) as unknown as {
        tokenSimulation: [string, (this: TokenSimulationApi, canvas: Canvas, registry: ElementRegistry, bus: EventBus) => void];
    };
    const api = {} as TokenSimulationApi;
    pluginDef.tokenSimulation[1].call(api, {getContainer: () => container as HTMLDivElement}, elementRegistry, eventBus);

    const dots = () => [...container.querySelectorAll<SVGCircleElement>("circle.token")];
    const dotsOf = (caseId: number) => dots().filter(dot => dot.getAttribute("data-case") === String(caseId));
    const position = (dot: Element) => [Number(dot.getAttribute("cx")), Number(dot.getAttribute("cy"))];
    const visible = (dot: SVGCircleElement) => dot.style.visibility !== "hidden";

    return {api, container, graphics, busHandlers, counters, dots, dotsOf, position, visible, getWtpt: () => wtpt};
}

const waitingAt = (count: number, elementId = "Flow_S_A", firstCase = 1): FrameCase[] =>
    Array.from({length: count}, (_, i) => ({caseId: firstCase + i, activeElements: {token_0: elementId}}));

describe("modules/simulation/index", () => {
    beforeEach(() => {
        jest.useFakeTimers({doNotFake: ["performance", "requestAnimationFrame", "cancelAnimationFrame"]});
        setupDom();
        clock = 0;
        frameCallbacks = [];
        jest.spyOn(performance, "now").mockImplementation(() => clock);
        global.requestAnimationFrame = ((callback: FrameRequestCallback) => {
            frameCallbacks.push(callback);
            return frameCallbacks.length;
        }) as typeof requestAnimationFrame;
        mockedAxios.get.mockResolvedValue({data: {batches: [], pointer: -1}});
        mockedAxios.post.mockResolvedValue({data: {frames: [], batches: [], pointer: -1, finishedCasesNumber: 0, wtpt: {}}});
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe("where the dots rest", () => {
        it("queues waiting cases on the arrow into the task and counts them once there are more than five", async () => {
            const {api, dots, position, visible, container, graphics} = setup({frames: waitingAt(7), batches: emptyBatches(0, 6)});
            api.start();
            await play(50);

            expect(dots()).toHaveLength(7);
            expect(dots().every(dot => dot.getAttribute("fill") === STATE_COLORS.waiting)).toBe(true);
            // First in line next to the arrowhead, the next ones further back on the arrow
            expect(position(dots()[0])).toEqual([90, 38]);
            expect(position(dots()[1])).toEqual([76, 38]);
            expect(dots().filter(visible)).toHaveLength(5);

            const pill = container.querySelector(".load-pill.waiting");
            expect(pill.textContent).toBe("7 waiting");
            expect(pill.getAttribute("data-task")).toBe("Task_A");
            expect((graphics.Task_A.querySelector("rect") as SVGRectElement).style.fill).toContain("rgba(245, 158, 11");
        });

        it("puts cases in work in a row under the task, off its label", async () => {
            const {api, dots, position} = setup({
                frames: [{caseId: 1, activeElements: {token_0: "Task_A"}}, {caseId: 2, activeElements: {token_0: "Task_A"}}],
                batches: emptyBatches(0, 6),
            });
            api.start();
            await play(50);

            expect(dots().map(position)).toEqual([[143, 89], [157, 89]]);
            expect(dots().every(dot => dot.getAttribute("fill") === STATE_COLORS.working)).toBe(true);
        });

        it("gives a task its own fill back once its queue is empty", async () => {
            const {api, graphics} = setup({
                frames: waitingAt(1),
                batches: [batch(0), batch(1, [event(1, LifecycleTypes.START, 1.5, "Task_A", {token_0: ["Task_A"]})]), ...emptyBatches(2, 6)],
            });
            api.start();
            await play(50);
            const rect = graphics.Task_A.querySelector("rect") as SVGRectElement;
            expect(rect.style.fill).toContain("rgba(245, 158, 11");

            await play(2100);
            expect(rect.style.fill).toBe("white");
        });

        it("marks branches waiting at a parallel join", async () => {
            const {api, dots} = setup({frames: [{caseId: 1, activeElements: {token_1: "Flow_B_J"}}], batches: emptyBatches(0, 6)});
            api.start();
            await play(50);

            expect(dots()[0].getAttribute("fill")).toBe(STATE_COLORS.sync);
        });
    });

    describe("moving cases", () => {
        it("moves a new case to the queue of its first task, colouring it while it moves", async () => {
            const {api, dotsOf, position} = setup({
                batches: [batch(0, [
                    event(1, LifecycleTypes.CASE_ARRIVAL, 0.2, "Start", {token_0: ["Start", "Flow_S_A"]}),
                    event(1, LifecycleTypes.ENABLE, 0.2, "Task_A"),
                ]), ...emptyBatches(1, 6)],
            });
            api.start();
            await play(500);

            expect(dotsOf(1)[0].getAttribute("fill")).toBe(STATE_COLORS.moving);

            await play(600);
            expect(dotsOf(1)[0].getAttribute("fill")).toBe(STATE_COLORS.waiting);
            expect(position(dotsOf(1)[0])).toEqual([90, 38]);
        });

        it("leaves a single dot when parallel branches merge at the join", async () => {
            const {api, dotsOf, position} = setup({
                frames: [{caseId: 1, activeElements: {token_1: "Flow_B_J", token_2: "Task_C"}}],
                batches: [batch(0, [
                    event(1, LifecycleTypes.COMPLETE, 0.5, "Task_C", {
                        token_1: ["J"],
                        token_2: ["Task_C", "Flow_C_J", "J"],
                        token_3: ["J", "Flow_J_E"],
                    }),
                ]), ...emptyBatches(1, 6)],
            });
            api.start();
            await play(50);
            expect(dotsOf(1)).toHaveLength(2);

            await play(1200);
            expect(dotsOf(1)).toHaveLength(1);
            expect(dotsOf(1)[0].getAttribute("data-token")).toBe("token_3");
            expect(position(dotsOf(1)[0])).toEqual([690, 40]);
        });

        it("splits a case into hidden branches that appear when the split is reached", async () => {
            const {api, dotsOf} = setup({
                frames: [{caseId: 1, activeElements: {token_0: "Task_A"}}],
                batches: [batch(0, [
                    event(1, LifecycleTypes.COMPLETE, 0.5, "Task_A", {
                        token_0: ["Task_A", "Flow_A_P", "P"],
                        token_1: ["P", "Flow_P_B"],
                        token_2: ["P", "Flow_P_C"],
                    }),
                ]), ...emptyBatches(1, 6)],
            });
            api.start();
            await play(50);
            await play(1200);

            expect(dotsOf(1).map(dot => dot.getAttribute("data-token")).sort()).toEqual(["token_1", "token_2"]);
            expect(dotsOf(1).every(dot => dot.getAttribute("fill") === STATE_COLORS.waiting)).toBe(true);
        });

        it("fades out and counts a case that ends", async () => {
            const {api, dotsOf, counters} = setup({
                frames: [{caseId: 1, activeElements: {token_0: "Flow_J_E"}}],
                batches: [batch(0, [event(1, LifecycleTypes.CASE_END, 0.5, "End", {token_0: ["End"]})]), ...emptyBatches(1, 6)],
            });
            api.start();
            await play(1200);

            expect(counters).toEqual({ongoing: 0, finished: 1});
            const dot = dotsOf(1)[0];
            expect(dot.classList.contains("fade-out")).toBe(true);
            dot.dispatchEvent(new Event("animationend"));
            expect(dotsOf(1)).toHaveLength(0);
        });
    });

    describe("what the analyst can inspect", () => {
        const twoWaitingOneWorking = () => [batch(0, [
            event(1, LifecycleTypes.CASE_ARRIVAL, 0.1, "Start", {token_0: ["Start", "Flow_S_A"]}),
            event(1, LifecycleTypes.ENABLE, 0.1, "Task_A"),
            event(2, LifecycleTypes.CASE_ARRIVAL, 0.3, "Start", {token_0: ["Start", "Flow_S_A"]}),
            event(2, LifecycleTypes.ENABLE, 0.3, "Task_A"),
            event(3, LifecycleTypes.CASE_ARRIVAL, 0.5, "Start", {token_0: ["Start", "Flow_S_A"]}),
            event(3, LifecycleTypes.ENABLE, 0.5, "Task_A"),
            event(3, LifecycleTypes.START, 0.5, "Task_A", {token_0: ["Task_A"]}),
        ]), ...emptyBatches(1, 6)];

        it("describes a case on hover: what it waits for, for how long, and how long it is open", async () => {
            const {api, dotsOf} = setup({batches: twoWaitingOneWorking()});
            api.start();
            await play(1000);

            dotsOf(1)[0].dispatchEvent(new MouseEvent("mouseover", {bubbles: true, clientX: 10, clientY: 10}));
            const tooltip = document.getElementById("token-tooltip");
            expect(tooltip.style.display).toBe("block");
            expect([...tooltip.children].map(line => line.textContent)).toEqual([
                "Case 1",
                "Waiting for Check form for 54 min",
                "Case open 54 min",
            ]);

            dotsOf(3)[0].dispatchEvent(new MouseEvent("mouseover", {bubbles: true}));
            expect(tooltip.children[1].textContent).toBe("In work: Check form for 30 min");

            dotsOf(3)[0].dispatchEvent(new MouseEvent("mouseout", {bubbles: true}));
            expect(tooltip.style.display).toBe("none");
        });

        it("lists the cases at a task, waiting first and longest waiting first", async () => {
            const {api} = setup({batches: twoWaitingOneWorking()});
            api.start();
            await play(1000);

            expect(api.getTaskQueue("Task_A")).toEqual([
                {caseId: 1, state: "waiting", since: START + 0.1 * HOUR, arrival: START + 0.1 * HOUR},
                {caseId: 2, state: "waiting", since: START + 0.3 * HOUR, arrival: START + 0.3 * HOUR},
                {caseId: 3, state: "working", since: START + 0.5 * HOUR, arrival: START + 0.5 * HOUR},
            ]);
            expect(api.getTaskQueue("Task_B")).toEqual([]);
            expect(api.getCurrentTime()).toBe(START + HOUR);
        });

        it("reports the load of every task, at most a few times a second", async () => {
            const onTaskLoad = jest.fn();
            const {api} = setup({frames: waitingAt(3), batches: emptyBatches(0, 6), hooks: {onTaskLoad}});
            api.start();
            await play(400);

            expect(onTaskLoad).toHaveBeenLastCalledWith({Task_A: {waiting: 3, inWork: 0}});
            expect(onTaskLoad.mock.calls.length).toBeLessThanOrEqual(2);
        });

        it("reports clicks on a task and on its count", async () => {
            const onTaskClick = jest.fn();
            const {api, busHandlers, container} = setup({frames: waitingAt(6), batches: emptyBatches(0, 6), hooks: {onTaskClick}});
            api.start();
            await play(50);

            busHandlers["element.click"].forEach(handler => handler({element: {id: "Task_B", type: NodeTypes.TASK}}));
            busHandlers["element.click"].forEach(handler => handler({element: {id: "P", type: NodeTypes.PARALLEL_GATEWAY}}));
            container.querySelector(".load-pill.waiting").dispatchEvent(new MouseEvent("click"));

            expect(onTaskClick.mock.calls).toEqual([["Task_B"], ["Task_A"]]);
        });

        it("colours dots by case age against the average cycle time", async () => {
            const arrivals = {1: START - 10 * HOUR, 2: START - 3 * HOUR, 3: START};
            const {api, dotsOf} = setup({
                frames: waitingAt(3),
                batches: emptyBatches(0, 6),
                hooks: {getCaseArrival: caseId => arrivals[caseId], getAverageCycleTime: () => 4 * HOUR},
            });
            api.start();
            await play(50);
            api.setColorMode("age");

            expect(dotsOf(1)[0].getAttribute("fill")).toBe(AGE_COLORS.overdue);
            expect(dotsOf(2)[0].getAttribute("fill")).toBe(AGE_COLORS.young);

            api.setColorMode("state");
            expect(dotsOf(1)[0].getAttribute("fill")).toBe(STATE_COLORS.waiting);
        });

        it("adds the hook's text to the timeline tooltip", async () => {
            const {api} = setup({batches: emptyBatches(0, 6), hooks: {describeMoment: () => "12 cases in progress"}});
            api.start();

            document.getElementById("timeline").dispatchEvent(new MouseEvent("mousemove", {clientX: 50, clientY: 5}));
            expect(document.getElementById("timeline-tooltip").textContent).toBe("2024-01-01 03:00:00 · 12 cases in progress");
        });
    });

    describe("playback", () => {
        it("plays every batch at the chosen pace and stops at the end", async () => {
            const {api} = setup({batches: emptyBatches(0, 2), endHours: 2});
            api.start();
            await play(1000);
            expect(document.getElementById("simulated-time-box").textContent).toBe("2024-01-01 01:00:00 UTC+00:00");
            expect(document.getElementById("play-pause-btn").innerHTML).toBe("");

            await play(1200);
            expect(document.getElementById("simulated-time-box").textContent).toBe("2024-01-01 02:00:00 UTC+00:00");
            expect(document.getElementById("play-pause-btn").innerHTML).toBe(" ▶");
        });

        it("at fast speeds, applies every hour it passes and moves the dots straight to where the cases are", async () => {
            const {api, dotsOf, position, counters} = setup({
                batches: [
                    batch(0, [
                        event(1, LifecycleTypes.CASE_ARRIVAL, 0.1, "Start", {token_0: ["Start", "Flow_S_A"]}),
                        event(1, LifecycleTypes.ENABLE, 0.1, "Task_A"),
                    ]),
                    batch(1, [event(1, LifecycleTypes.START, 1.5, "Task_A", {token_0: ["Task_A"]})]),
                    ...emptyBatches(2, 6),
                ],
            });
            api.start();
            const select = document.getElementById("speed-select") as HTMLSelectElement;
            select.value = "24";
            select.dispatchEvent(new Event("change"));
            await play(400);

            // 1 day/s: two simulated hours pass in about 85 ms
            await play(100);
            expect(dotsOf(1)).toHaveLength(1);
            expect(position(dotsOf(1)[0])).toEqual([150, 89]);
            expect(dotsOf(1)[0].getAttribute("fill")).toBe(STATE_COLORS.working);
            expect(counters.ongoing).toBe(1);

            await play(300);
            expect(document.getElementById("play-pause-btn").innerHTML).toBe(" ▶");
            expect(document.getElementById("simulated-time-box").textContent).toBe("2024-01-01 06:00:00 UTC+00:00");
        });

        it("loads more batches as the queue runs low, in chunks sized to the speed", async () => {
            mockedAxios.get.mockResolvedValueOnce({data: {batches: emptyBatches(2, 4), pointer: -1}});
            const {api} = setup({batches: emptyBatches(0, 2), pointer: 2, endHours: 4});
            api.start();
            await play(4500);

            expect(mockedAxios.get).toHaveBeenCalledWith("/api/simulation/p1/polling?pointer=2&limit=15");
            expect(document.getElementById("simulated-time-box").textContent).toBe("2024-01-01 04:00:00 UTC+00:00");
            expect(document.getElementById("play-pause-btn").innerHTML).toBe(" ▶");
        });

        it("pauses and resumes", async () => {
            const {api} = setup({batches: emptyBatches(0, 6)});
            api.start();
            await play(500);

            const button = document.getElementById("play-pause-btn");
            button.click();
            expect(button.innerHTML).toBe(" ▶");
            await play(2000);
            const pausedAt = document.getElementById("simulated-time-box").textContent;
            await play(1000);
            expect(document.getElementById("simulated-time-box").textContent).toBe(pausedAt);

            button.click();
            expect(button.innerHTML).toBe("⏸");
            await play(1500);
            expect(document.getElementById("simulated-time-box").textContent).not.toBe(pausedAt);
        });

        it("jumps to a moment: redraws the cases from the server's state with their waiting times", async () => {
            mockedAxios.post.mockResolvedValueOnce({data: {
                frames: [{caseId: 9, activeElements: {token_0: "Flow_S_A"}}],
                batches: emptyBatches(6, 6),
                pointer: -1,
                finishedCasesNumber: 4,
                wtpt: {Task_A: {name: "Task_A", averageWT: 0, averagePT: 0, _count: 0, incompleteCases: {9: {enablementTime: START + 5 * HOUR}}}},
            }});
            const {api, dots, dotsOf, counters} = setup({frames: waitingAt(2), batches: emptyBatches(0, 6)});
            api.start();
            await play(100);

            document.getElementById("go-to-end-btn").click();
            await play(100);

            expect(mockedAxios.post).toHaveBeenCalledWith("/api/simulation/p1/resumption", {requestedDate: iso(6)});
            expect(dots()).toHaveLength(1);
            expect(counters).toEqual({ongoing: 1, finished: 4});
            expect(api.getTaskQueue("Task_A")).toEqual([{caseId: 9, state: "waiting", since: START + 5 * HOUR, arrival: null}]);
            expect(dotsOf(9)[0].getAttribute("fill")).toBe(STATE_COLORS.waiting);
        });

        it("drops batches still loading for a position the user jumped away from", async () => {
            let answer: (value: unknown) => void;
            mockedAxios.get.mockReturnValueOnce(new Promise(resolve => { answer = resolve; }));
            mockedAxios.post.mockResolvedValueOnce({data: {frames: [], batches: emptyBatches(0, 6), pointer: -1, finishedCasesNumber: 0, wtpt: {}}});
            const {api} = setup({batches: emptyBatches(0, 1), pointer: 1});
            api.start();
            await play(100);

            document.getElementById("go-to-start-btn").click();
            await play(100);
            answer({data: {batches: emptyBatches(1, 30), pointer: -1}});
            await play(7000);

            // Only the six hours of the jump were played, none of the 29 stale ones
            expect(document.getElementById("simulated-time-box").textContent).toBe("2024-01-01 06:00:00 UTC+00:00");
        });
    });
});
