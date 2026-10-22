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
    beforeEach(() => {
        jest.clearAllMocks();
        routeId = "p1";
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
        fireEvent.click(screen.getByRole("button", {name: "◀"}));
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

        it("labels the cycle-time chart, marks tasks without data, and keeps diagnostics collapsed", async () => {
            await renderLoaded();

            expect(await screen.findByText("2.0")).toBeInTheDocument();
            expect(screen.getByText("1 Jan")).toBeInTheDocument();
            expect(screen.getByText("8 Jan")).toBeInTheDocument();
            expect(screen.getAllByText("No data yet").length).toBeGreaterThan(0);
            expect(screen.getByText("Diagnostics").closest("details")).not.toHaveAttribute("open");
        });

        it("refits the diagram when the stats panel is opened", async () => {
            jest.useFakeTimers();
            try {
                await renderLoaded();
                canvasZoomMock.mockClear();

                fireEvent.click(screen.getByRole("button", {name: "◀"}));
                jest.advanceTimersByTime(400);

                expect(canvasResizedMock).toHaveBeenCalled();
                expect(canvasZoomMock).toHaveBeenCalledWith("fit-viewport");
            } finally {
                jest.useRealTimers();
            }
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
                return Promise.resolve({data: [1, 2]});
            });
            render(<Simulation />);
            await waitFor(() => expect(importXMLMock).toHaveBeenCalled());
            await screen.findByText(/Forecast at/);
            return (simulationModule as jest.Mock).mock.calls[0][5];
        };

        it("summarises the forecast at the horizon", async () => {
            await renderWithAnalysis();

            expect(screen.getByText("Forecast at 8 Jan")).toBeInTheDocument();
            expect(screen.getByText(/158 open/)).toBeInTheDocument();
            expect(screen.getByText(/61 of 69 open at the start finished/)).toBeInTheDocument();
            expect(screen.getByText("No case is waiting")).toBeInTheDocument();
        });

        it("lists the longest queues reported by the simulation and opens a task's details from them", async () => {
            const hooks = await renderWithAnalysis();
            act(() => hooks.onTaskLoad({Task_1: {waiting: 12, inWork: 2}}));

            const chip = screen.getByRole("button", {name: /Task One\s*12 waiting/});
            fireEvent.click(chip);

            const panel = screen.getByRole("complementary", {name: "Task Task One"});
            expect(within(panel).getByText("1 waiting")).toBeInTheDocument();
            expect(within(panel).getByText("1 in work")).toBeInTheDocument();
            expect(within(panel).getByText("waiting 4 h · open since before the start")).toBeInTheDocument();
            expect(within(panel).getByText("in work 1 h · open 3 h")).toBeInTheDocument();
            expect(within(panel).getByRole("img", {name: "Cases waiting for Task One over the simulation, at most 12"})).toBeInTheDocument();

            fireEvent.keyDown(window, {key: "Escape"});
            expect(screen.queryByRole("complementary", {name: "Task Task One"})).not.toBeInTheDocument();
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
