import {render, screen, waitFor, fireEvent, act, within} from "@testing-library/react";
import Simulation from "./page";
import axios from "axios";
import simulationModule from "@modules/simulation";

const replaceMock = jest.fn();
let routeId: string | undefined = "p1";
const NativeBlob = globalThis.Blob;

jest.mock("next/navigation", () => ({
    useRouter: () => ({replace: replaceMock}),
    useParams: () => ({id: routeId}),
}));

jest.mock("axios", () => ({
    get: jest.fn(),
}));

const destroyMock = jest.fn();
const importXMLMock = jest.fn();
const getMock = jest.fn();
const canvasZoomMock = jest.fn();
const canvasResizedMock = jest.fn();

jest.mock("bpmn-js/lib/NavigatedViewer", () => {
    return jest.fn().mockImplementation(() => ({
        importXML: importXMLMock,
        get: getMock,
        destroy: destroyMock,
    }));
});

jest.mock("@modules/simulation", () => ({
    __esModule: true,
    default: jest.fn((_data, _setCases, setWtpt) => {
        setWtpt({
            Task_1: {
                name: "Task One",
                averageWT: 3600000,
                averagePT: 7200000,
                _count: 1,
                incompleteCases: {},
            },
            Task_2: {
                name: "Task Two",
                averageWT: 0,
                averagePT: 0,
                _count: 0,
                incompleteCases: {},
            },
        });
        return {};
    }),
}));

describe("Simulation page", () => {
    const mockLoadedSimulation = () => {
        (axios.get as jest.Mock).mockImplementation((url: string) => {
            if (url === "/api/simulation/p1") {
                return Promise.resolve({
                    data: {
                        processId: "p1",
                        batches: [],
                        frames: [],
                        file: Buffer.from("<xml />"),
                        startDate: "2024-01-01 00:00:00",
                        endDate: "2024-01-08 00:00:00",
                        utcOffset: "+02:00",
                        pointer: 0,
                    },
                });
            }
            if (url === "/api/simulation/p1/cycle-time") {
                return Promise.resolve({data: [3600000, 7200000]});
            }
            return Promise.resolve({data: [1, 2]});
        });
    };

    beforeEach(() => {
        jest.clearAllMocks();
        routeId = "p1";
        window.history.replaceState(null, "", "/simulation/p1");
        localStorage.setItem("prosim-help-seen", "1");
        // Ensure Buffer exists in jsdom tests for the conversion path in the component.
        (globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
        importXMLMock.mockResolvedValue(undefined);
        (globalThis as unknown as { Blob: typeof Blob }).Blob = class MockBlob {
            async text() {
                return "<xml />";
            }
        } as unknown as typeof Blob;

        getMock.mockImplementation((name: string) => {
            if (name === "canvas") {
                return {zoom: canvasZoomMock, resized: canvasResizedMock};
            }
            if (name === "tokenSimulation") {
                return {start: jest.fn()};
            }
            if (name === "elementRegistry") {
                return {
                    getAll: () => [
                        {id: "Task_1", businessObject: {$type: "bpmn:Task", name: "Task One"}},
                        {id: "Flow_1", businessObject: {$type: "bpmn:SequenceFlow", name: "Flow One"}},
                    ],
                };
            }
            return {};
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
        (globalThis as unknown as { Blob: typeof Blob }).Blob = NativeBlob;
    });

    it("fetches simulation data, workload, and cycle time and initializes the viewer", async () => {
        (axios.get as jest.Mock).mockImplementation((url: string) => {
            if (url === "/api/simulation/p1") {
                return Promise.resolve({
                    data: {
                        processId: "p1",
                        batches: [],
                        frames: [{caseId: 1, activeElements: {token: "Task_1"}}],
                        file: Buffer.from("<xml />"),
                        startDate: "2024-01-01 00:00:00",
                        endDate: "2024-01-01 02:00:00",
                        pointer: 0,
                    },
                });
            }
            if (url === "/api/simulation/p1/workload") {
                return Promise.resolve({data: [1, 2]});
            }
            if (url === "/api/simulation/p1/cycle-time") {
                return Promise.resolve({data: [100, 200]});
            }
            throw new Error(`Unexpected URL: ${url}`);
        });

        render(<Simulation />);

        await waitFor(() => {
            expect(axios.get).toHaveBeenCalledWith("/api/simulation/p1");
        });
        expect(axios.get).toHaveBeenCalledWith("/api/simulation/p1/workload");
        expect(axios.get).toHaveBeenCalledWith("/api/simulation/p1/cycle-time");
        await waitFor(() => {
            expect(importXMLMock).toHaveBeenCalledWith("<xml />");
        });
        expect(simulationModule).toHaveBeenCalled();

        expect(screen.getByText("Statistics")).toBeInTheDocument();
        expect(screen.getByText("Task One")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "A→Z"}));
        expect(screen.getByRole("button", {name: "Z→A"})).toBeInTheDocument();
    });

    it("says the simulation was not found or expired when the API returns 404", async () => {
        (axios.get as jest.Mock).mockImplementation((url: string) => {
            if (url === "/api/simulation/p1") {
                return Promise.reject({response: {status: 404}});
            }
            return Promise.resolve({data: []});
        });

        render(<Simulation />);

        expect(await screen.findByText("Simulation not found or expired")).toBeInTheDocument();
        expect(screen.getByRole("link", {name: "Start a new simulation"})).toHaveAttribute("href", "/");
        expect(replaceMock).not.toHaveBeenCalled();
    });

    it("asks to reload when the simulation fails to load for another reason", async () => {
        (axios.get as jest.Mock).mockImplementation((url: string) => {
            if (url === "/api/simulation/p1") {
                return Promise.reject(new Error("network down"));
            }
            return Promise.resolve({data: []});
        });

        render(<Simulation />);

        expect(await screen.findByText("The simulation could not be loaded")).toBeInTheDocument();
    });

    it("does not fetch when route id is missing", () => {
        routeId = undefined;

        render(<Simulation />);

        expect(axios.get).not.toHaveBeenCalled();
    });

    it("logs workload and cycle-time fetch failures without redirecting", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        (axios.get as jest.Mock).mockImplementation((url: string) => {
            if (url === "/api/simulation/p1") {
                return Promise.resolve({
                    data: {
                        processId: "p1",
                        batches: [],
                        frames: [{caseId: 1, activeElements: {token: "Task_1"}}],
                        file: Buffer.from("<xml />").toJSON().data,
                        startDate: "2024-01-01 00:00:00",
                        endDate: "2024-01-01 02:00:00",
                        pointer: 0,
                    },
                });
            }
            if (url === "/api/simulation/p1/workload") {
                return Promise.reject(new Error("workload failed"));
            }
            if (url === "/api/simulation/p1/cycle-time") {
                return Promise.reject(new Error("cycle-time failed"));
            }
            return Promise.resolve({data: []});
        });

        render(<Simulation />);

        await waitFor(() => {
            expect(errorSpy).toHaveBeenCalledTimes(2);
        });
        expect(replaceMock).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("unmounts safely after initialization fetch", async () => {
        (axios.get as jest.Mock).mockImplementation((url: string) => {
            if (url === "/api/simulation/p1") {
                return Promise.resolve({
                    data: {
                        processId: "p1",
                        batches: [],
                        frames: [{caseId: 1, activeElements: {token: "Task_1"}}],
                        file: Buffer.from("<xml />").toJSON().data,
                        startDate: "2024-01-01 00:00:00",
                        endDate: "2024-01-01 02:00:00",
                        pointer: 0,
                    },
                });
            }
            return Promise.resolve({data: [1, 2]});
        });

        const {unmount} = render(<Simulation />);

        await waitFor(() => {
            expect(screen.getByText("Statistics")).toBeInTheDocument();
        });
        await waitFor(() => {
            expect(importXMLMock).toHaveBeenCalled();
        });

        unmount();
        expect(screen.queryByText("Statistics")).not.toBeInTheDocument();
        expect(destroyMock).toHaveBeenCalled();
    });

    it("destroys previous viewer instance when the route id changes", async () => {
        (axios.get as jest.Mock).mockImplementation((url: string) => {
            if (url.endsWith("/workload")) {
                return Promise.resolve({data: [1, 2]});
            }
            if (url.endsWith("/cycle-time")) {
                return Promise.resolve({data: [1, 2]});
            }
            if (/\/api\/simulation\/[^/]+$/.test(url)) {
                return Promise.resolve({
                    data: {
                        processId: "p1",
                        batches: [],
                        frames: [{caseId: 1, activeElements: {token: "Task_1"}}],
                        file: Buffer.from("<xml />").toJSON().data,
                        startDate: "2024-01-01 00:00:00",
                        endDate: "2024-01-01 02:00:00",
                        pointer: 0,
                    },
                });
            }
            return Promise.resolve({data: undefined});
        });

        const {rerender} = render(<Simulation />);
        await waitFor(() => {
            expect(importXMLMock).toHaveBeenCalled();
        });

        routeId = "p2";
        rerender(<Simulation />);

        await waitFor(() => {
            expect(destroyMock).toHaveBeenCalled();
        });
    });

    describe("toolbar, shortcuts and stats panel", () => {
        const renderLoaded = async () => {
            mockLoadedSimulation();
            render(<Simulation />);
            await waitFor(() => expect(importXMLMock).toHaveBeenCalled());
        };

        it("plays/pauses with Space and jumps with Home/End, but not while typing in a control", async () => {
            await renderLoaded();
            const clicks: string[] = [];
            ["play-pause-btn", "go-to-start-btn", "go-to-end-btn"].forEach(id =>
                document.getElementById(id)!.addEventListener("click", () => clicks.push(id)));

            fireEvent.keyDown(window, {key: " "});
            fireEvent.keyDown(window, {key: "Home"});
            fireEvent.keyDown(window, {key: "End"});
            fireEvent.keyDown(document.getElementById("speed-select")!, {key: " "});
            fireEvent.keyDown(screen.getByRole("button", {name: "Copy link"}), {key: " "});

            expect(clicks).toEqual(["play-pause-btn", "go-to-start-btn", "go-to-end-btn"]);
        });

        it("copies the simulation link and links to a new simulation", async () => {
            const writeText = jest.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, "clipboard", {value: {writeText}, configurable: true});
            await renderLoaded();

            fireEvent.click(screen.getByRole("button", {name: "Copy link"}));

            await waitFor(() => expect(writeText).toHaveBeenCalledWith(window.location.href));
            expect(screen.getByRole("link", {name: "← New simulation"})).toHaveAttribute("href", "/");
        });

        it("labels the cycle-time chart, marks tasks without data, and shows no diagnostics", async () => {
            await renderLoaded();

            expect(await screen.findByText("2.0")).toBeInTheDocument();
            expect(screen.getByText("1 Jan")).toBeInTheDocument();
            expect(screen.getByText("8 Jan")).toBeInTheDocument();
            expect(screen.getAllByText("No data yet").length).toBeGreaterThan(0);
            expect(screen.queryByText("Diagnostics")).not.toBeInTheDocument();
        });

        it("opens the stats panel by default and refits the diagram when it is toggled", async () => {
            jest.useFakeTimers();
            try {
                await renderLoaded();
                canvasZoomMock.mockClear();

                fireEvent.click(screen.getByRole("button", {name: "▶"}));
                jest.advanceTimersByTime(400);

                expect(canvasResizedMock).toHaveBeenCalled();
                expect(canvasZoomMock).toHaveBeenCalledWith("fit-viewport");
            } finally {
                jest.useRealTimers();
            }
        });
    });

    describe("shared links", () => {
        const loaded = async () => {
            mockLoadedSimulation();
            render(<Simulation />);
            await waitFor(() => expect(importXMLMock).toHaveBeenCalled());
        };

        it("opens at the moment, speed and colouring in the link", async () => {
            window.history.replaceState(null, "", "/simulation/p1?t=2024-01-01T01:00:00Z&speed=6&colour=age");
            await loaded();

            expect((simulationModule as jest.Mock).mock.calls[0][4]).toEqual({
                moment: Date.UTC(2024, 0, 1, 1),
                hoursPerSecond: 6,
                colorMode: "age",
            });
            expect(screen.getByRole("combobox")).toHaveValue("6");
            expect(screen.getByRole("button", {name: "Case age"})).toHaveAttribute("aria-pressed", "true");
        });

        it("puts the current view in the copied link and in the address bar", async () => {
            const writeText = jest.fn().mockResolvedValue(undefined);
            Object.defineProperty(navigator, "clipboard", {value: {writeText}, configurable: true});
            getMock.mockImplementation((name: string) => {
                if (name === "canvas") return {zoom: canvasZoomMock, resized: canvasResizedMock};
                if (name === "tokenSimulation") return {start: jest.fn(), setColorMode: jest.fn(), getCurrentTime: () => Date.UTC(2024, 0, 1, 1, 30)};
                if (name === "elementRegistry") return {getAll: () => []};
                return {};
            });
            await loaded();

            fireEvent.click(screen.getByRole("button", {name: "Case age"}));
            fireEvent.change(screen.getByRole("combobox"), {target: {value: "24"}});
            fireEvent.click(screen.getByRole("button", {name: "Copy link"}));

            const query = "?t=2024-01-01T01:30:00Z&speed=24&colour=age";
            await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/simulation/p1${query}`));
            expect(window.location.search).toBe(query);
        });

        it("opens the task in the link, if the model has it", async () => {
            window.history.replaceState(null, "", "/simulation/p1?task=Task_1");
            await loaded();
            expect(await screen.findByRole("complementary", {name: "Task Task One"})).toBeInTheDocument();
        });

        it("ignores a task the model does not have", async () => {
            window.history.replaceState(null, "", "/simulation/p1?task=Nope");
            await loaded();
            await act(async () => {});
            expect(screen.queryByRole("complementary", {name: /^Task/})).not.toBeInTheDocument();
        });
    });

    describe("first visit", () => {
        const loaded = async () => {
            mockLoadedSimulation();
            render(<Simulation />);
            await waitFor(() => expect(importXMLMock).toHaveBeenCalled());
        };

        it("explains the view once, and it can be opened again", async () => {
            localStorage.removeItem("prosim-help-seen");
            await loaded();

            fireEvent.click(screen.getByRole("button", {name: "Got it"}));
            expect(screen.queryByRole("complementary", {name: "How to read this"})).not.toBeInTheDocument();
            expect(localStorage.getItem("prosim-help-seen")).toBe("1");

            fireEvent.click(screen.getByRole("button", {name: "How to read this"}));
            expect(screen.getByRole("complementary", {name: "How to read this"})).toBeInTheDocument();
        });

        it("stays away for someone who has seen it", async () => {
            await loaded();
            expect(screen.queryByRole("complementary", {name: "How to read this"})).not.toBeInTheDocument();
        });

        it("closes with Escape", async () => {
            localStorage.removeItem("prosim-help-seen");
            await loaded();
            fireEvent.keyDown(window, {key: "Escape"});
            expect(screen.queryByRole("complementary", {name: "How to read this"})).not.toBeInTheDocument();
        });
    });

    describe("narrow screens and exports", () => {
        afterEach(() => {
            delete (window as unknown as {matchMedia?: unknown}).matchMedia;
        });

        it("starts with the statistics closed and keeps the diagram's zoom when they open", async () => {
            window.matchMedia = jest.fn().mockReturnValue({matches: true}) as unknown as typeof window.matchMedia;
            mockLoadedSimulation();
            render(<Simulation />);
            await waitFor(() => expect(importXMLMock).toHaveBeenCalled());

            expect(document.querySelector<HTMLElement>(".stats-sidebar").style.transform).toBe("translateX(300px)");
            canvasResizedMock.mockClear();
            fireEvent.click(document.querySelector(".stats-toggle-btn"));
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 350)); });

            expect(document.querySelector<HTMLElement>(".stats-sidebar").style.transform).toBe("translateX(0)");
            expect(canvasResizedMock).not.toHaveBeenCalled();
        });

        it("offers the exports from the toolbar", async () => {
            mockLoadedSimulation();
            render(<Simulation />);
            await waitFor(() => expect(importXMLMock).toHaveBeenCalled());

            fireEvent.click(screen.getByRole("button", {name: "Export"}));

            expect(await screen.findByRole("menuitem", {name: "Simulated log (CSV)"})).toHaveAttribute("href", "/api/simulation/p1/export?type=log");
            expect(screen.getByRole("menuitem", {name: "Activity statistics (CSV)"})).toHaveAttribute("href", "/api/simulation/p1/export?type=activities");
            expect(screen.getByRole("menuitem", {name: "Diagram now (PNG)"})).toBeInTheDocument();
            expect(screen.getByRole("menuitem", {name: "Diagram now (SVG)"})).toBeInTheDocument();
        });
    });

    describe("analyst view", () => {
        const HOUR = 3600000;
        const start = Date.UTC(2024, 0, 1);
        const analysis = {
            startDate: new Date(start).toISOString(),
            endDate: new Date(start + 7 * 24 * HOUR).toISOString(),
            stepMs: 24 * HOUR,
            open: [69, 80, 90, 100, 120, 140, 150, 158],
            tasks: {Task_1: {waiting: [0, 4, 8, 12, 9, 6, 3, 1], inWork: [1, 1, 2, 2, 1, 1, 1, 0]}},
            caseArrivals: {1: start},
            openAtStart: 69,
            openAtStartFinished: 61,
            openAtEnd: 158,
            arrived: 300,
            completed: 211,
            averageCycleTimeMs: 48 * HOUR,
        };
        const tokenSimulation = {
            start: jest.fn(),
            setColorMode: jest.fn(),
            getTaskQueue: jest.fn(() => [
                {caseId: 974, state: "waiting", since: start + 2 * HOUR, arrival: start},
                {caseId: 975, state: "working", since: start + 5 * HOUR, arrival: start + 3 * HOUR},
            ]),
            getCurrentTime: jest.fn(() => start + 6 * HOUR),
        };

        const renderWithAnalysis = async () => {
            getMock.mockImplementation((name: string) => {
                if (name === "canvas") return {zoom: canvasZoomMock, resized: canvasResizedMock};
                if (name === "tokenSimulation") return tokenSimulation;
                if (name === "elementRegistry") return {getAll: () => [{id: "Task_1", businessObject: {$type: "bpmn:UserTask", name: "Task One"}}]};
                return {};
            });
            (axios.get as jest.Mock).mockImplementation((url: string) => {
                if (url === "/api/simulation/p1") {
                    return Promise.resolve({data: {
                        processId: "p1", batches: [], frames: [], file: Buffer.from("<xml />"),
                        startDate: "2024-01-01 00:00:00", endDate: "2024-01-08 00:00:00", utcOffset: "+00:00", pointer: 0,
                    }});
                }
                if (url === "/api/simulation/p1/analysis") return Promise.resolve({data: analysis});
                if (url === "/api/simulation/p1/case/9") {
                    return Promise.resolve({data: [{lifecycle: "CASE_ARRIVAL", nodeId: "Start", timestamp: "2024-01-01 00:00:00", paths: {}}]});
                }
                return Promise.resolve({data: [1, 2]});
            });
            render(<Simulation />);
            await waitFor(() => expect(importXMLMock).toHaveBeenCalled());
            const hooks = (simulationModule as jest.Mock).mock.calls[0][3];
            await waitFor(() => expect(hooks.getAverageCycleTime()).toBe(48 * HOUR));
            return hooks;
        };

        it("shows a task's queue, averages and queue history when the simulation reports a click on it", async () => {
            const hooks = await renderWithAnalysis();
            act(() => hooks.onTaskClick("Task_1"));

            const panel = screen.getByRole("complementary", {name: "Task Task One"});
            expect(within(panel).getByText("1 waiting")).toBeInTheDocument();
            expect(within(panel).getByText("1 in work")).toBeInTheDocument();
            expect(within(panel).getByText("waiting 4 h · open since before the start")).toBeInTheDocument();
            expect(within(panel).getByText("in work 1 h · open 3 h")).toBeInTheDocument();
            expect(within(panel).getByRole("img", {name: "Cases waiting for Task One over the simulation, at most 12"})).toBeInTheDocument();

            fireEvent.keyDown(window, {key: "Escape"});
            expect(screen.queryByRole("complementary", {name: "Task Task One"})).not.toBeInTheDocument();
        });

        it("zooms to an activity picked in the statistics, marks it and opens its queue", async () => {
            const viewbox = jest.fn().mockReturnValue({outer: {width: 1000, height: 400}});
            const addMarker = jest.fn();
            const removeMarker = jest.fn();
            canvasZoomMock.mockReturnValue(0.4);
            await renderWithAnalysis();
            getMock.mockImplementation((name: string) => {
                if (name === "canvas") return {zoom: canvasZoomMock, resized: canvasResizedMock, viewbox, addMarker, removeMarker};
                if (name === "elementRegistry") return {get: () => ({x: 500, y: 200, width: 100, height: 80})};
                return tokenSimulation;
            });

            fireEvent.click(screen.getByRole("button", {name: /Task One/}));

            expect(screen.getByRole("complementary", {name: "Task Task One"})).toBeInTheDocument();
            expect(addMarker).toHaveBeenCalledWith("Task_1", "selected-task");
            expect(viewbox).toHaveBeenLastCalledWith({x: 230, y: 40, width: 1000, height: 400});
            expect(screen.getByRole("button", {name: /Task One/})).toHaveAttribute("aria-pressed", "true");

            fireEvent.keyDown(window, {key: "Escape"});
            expect(removeMarker).toHaveBeenCalledWith("Task_1", "selected-task");
        });

        it("follows a clicked case, and stops when it is clicked again", async () => {
            const setFollowedCase = jest.fn();
            Object.assign(tokenSimulation, {setFollowedCase, describeCase: () => ["Moving"], getCurrentTime: () => Date.UTC(2024, 0, 2)});
            const hooks = await renderWithAnalysis();

            act(() => hooks.onCaseClick(9));
            await waitFor(() => expect(setFollowedCase).toHaveBeenLastCalledWith(9));
            expect(await screen.findByText("Case 9")).toBeInTheDocument();
            expect(axios.get).toHaveBeenCalledWith("/api/simulation/p1/case/9");

            act(() => hooks.onCaseClick(9));
            await waitFor(() => expect(setFollowedCase).toHaveBeenLastCalledWith(null));
            expect(screen.queryByText("Case 9")).not.toBeInTheDocument();
        });

        it("closes the queue on the first Escape and the followed case on the second", async () => {
            const hooks = await renderWithAnalysis();
            act(() => hooks.onTaskClick("Task_1"));
            act(() => hooks.onCaseClick(9));
            const close = screen.getByRole("button", {name: "Stop following this case"});

            fireEvent.keyDown(window, {key: "Escape"});
            expect(screen.queryByRole("complementary", {name: "Task Task One"})).not.toBeInTheDocument();
            expect(close).toBeInTheDocument();

            fireEvent.keyDown(window, {key: "Escape"});
            expect(close).not.toBeInTheDocument();
        });

        it("has no summary strip above the diagram", async () => {
            await renderWithAnalysis();
            expect(screen.queryByLabelText("Simulation summary")).not.toBeInTheDocument();
            expect(screen.queryByText("Longest queues now")).not.toBeInTheDocument();
        });

        it("opens a task's details when the simulation reports a click on it", async () => {
            const hooks = await renderWithAnalysis();
            act(() => hooks.onTaskClick("Task_1"));

            expect(screen.getByRole("complementary", {name: "Task Task One"})).toBeInTheDocument();
            fireEvent.click(screen.getByRole("button", {name: "Close task details"}));
            expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
        });

        it("gives the simulation case arrivals, the average cycle time and the open cases at a moment", async () => {
            const hooks = await renderWithAnalysis();

            expect(hooks.getCaseArrival(1)).toBe(start);
            expect(hooks.getAverageCycleTime()).toBe(48 * HOUR);
            expect(hooks.describeMoment(start + 50 * HOUR)).toBe("90 cases in progress");
        });

        it("switches the dot colouring, zooms, and offers speeds in simulated time per second", async () => {
            await renderWithAnalysis();

            fireEvent.click(screen.getByRole("button", {name: "Case age"}));
            expect(tokenSimulation.setColorMode).toHaveBeenCalledWith("age");
            expect(screen.getByText("Over 2× the average")).toBeInTheDocument();

            canvasZoomMock.mockReturnValue(1);
            fireEvent.click(screen.getByRole("button", {name: "Zoom in"}));
            expect(canvasZoomMock).toHaveBeenCalledWith(1.25, "auto");
            fireEvent.click(screen.getByRole("button", {name: "Fit diagram"}));
            expect(canvasZoomMock).toHaveBeenCalledWith("fit-viewport");

            const options = [...(document.getElementById("speed-select") as HTMLSelectElement).options];
            expect(options.map(option => option.textContent)).toContain("1 week/s");
            expect((document.getElementById("speed-select") as HTMLSelectElement).value).toBe("1");
            expect(screen.getByText("Cases in progress")).toBeInTheDocument();
        });
    });
});
