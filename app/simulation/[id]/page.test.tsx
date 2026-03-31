import {render, screen, waitFor, fireEvent} from "@testing-library/react";
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
                return {zoom: jest.fn()};
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

    it("redirects to home when initial simulation fetch fails", async () => {
        (axios.get as jest.Mock).mockImplementation((url: string) => {
            if (url === "/api/simulation/p1") {
                return Promise.reject(new Error("not found"));
            }
            return Promise.resolve({data: []});
        });

        render(<Simulation />);

        await waitFor(() => {
            expect(replaceMock).toHaveBeenCalledWith("/");
        });
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
});


