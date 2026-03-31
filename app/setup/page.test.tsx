import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import Setup from "./page";
import {DataContext} from "@context/DataContext";
import {CsvContext} from "@context/CsvContext";
import {TimeUnits} from "@definitions/config/enums";
import axios from "axios";
import {toast} from "sonner";

const pushMock = jest.fn();
const replaceMock = jest.fn();

jest.mock("next/navigation", () => ({
    useRouter: () => ({push: pushMock, replace: replaceMock}),
}));

jest.mock("axios", () => ({
    post: jest.fn(),
}));

jest.mock("sonner", () => ({
    toast: {
        error: jest.fn(),
    },
}));

jest.mock("@components/Loader", () => ({
    __esModule: true,
    default: () => <div>loader</div>,
}));

jest.mock("@components/simulationSetup", () => ({
    Stepper: ({onSubmit, children}) => (
        <div>
            <button onClick={onSubmit}>run-submit</button>
            {children}
        </div>
    ),
    Step: ({label, onNext, children}) => (
        <div>
            <span>{label}</span>
            {onNext && (
                <>
                    <button onClick={() => {
                        const formData = new FormData();
                        if (label === "Setup the log mapping") {
                            formData.set("case", "case");
                            formData.set("activity", "activity");
                            formData.set("enablement", "enablement");
                            formData.set("start", "start");
                            formData.set("end", "end");
                            formData.set("resource", "resource");
                        }
                        if (label === "Setup your experiment") {
                            formData.set("simulationHorizonValue", "2");
                            formData.set("simulationHorizonUnit", "weeks");
                            formData.set("startingPoint", "2024-01-01T00:00");
                        }
                        onNext(formData);
                    }}>next-{label}</button>
                    <button onClick={() => {
                        const formData = new FormData();
                        if (label === "Setup the log mapping") {
                            formData.set("case", "case");
                            formData.set("activity", "case");
                            formData.set("enablement", "enablement");
                            formData.set("start", "start");
                            formData.set("end", "end");
                            formData.set("resource", "resource");
                        }
                        if (label === "Setup your experiment") {
                            formData.set("simulationHorizonValue", "2");
                            formData.set("startingPoint", "2024-01-01T00:00");
                        }
                        onNext(formData);
                    }}>next-invalid-{label}</button>
                    <button onClick={() => {
                        const formData = new FormData();
                        onNext(formData);
                    }}>next-empty-{label}</button>
                </>
            )}
            {children}
        </div>
    ),
    ConfigFileInput: () => <div>config-file-input</div>,
    MappingInput: () => <div>mapping-input</div>,
    Preview: ({children}) => <div>{children}</div>,
}));

jest.mock("@components/simulationSetup/configInput", () => ({
    ConfigInput: ({children}) => <div>{children}</div>,
    SimulationHorizonInput: () => <div>horizon-input</div>,
    StartingPointInput: () => <div>starting-point-input</div>,
}));

describe("Setup page", () => {
    const baseData = {
        id: "proc-1",
        mapping: {},
        config: {
            simulationHorizonValue: 8,
            simulationHorizonUnit: TimeUnits.WEEKS,
            startingPoint: "2024-01-01T00:00",
        },
        logFile: new File(["log"], "log.csv", {type: "text/csv"}),
        bpmnFile: new File(["bpmn"], "model.bpmn", {type: "text/bpmn"}),
        jsonFile: new File(["{}"], "params.json", {type: "application/json"}),
    };
    const baseCsv = {
        headers: ["case", "activity", "enablement", "start", "end", "resource", "extra"],
        firstLine: ["1", "A", "2024-01-01 00:00:00", "2024-01-01 01:00:00", "2024-01-01 02:00:00", "R", "x"],
        lastLine: ["2", "B", "2024-01-02 00:00:00", "2024-01-02 01:00:00", "2024-01-02 02:00:00", "R", "y"],
        logStartDate: "2024-01-01T00:00:00",
        logEndDate: "2024-01-02T02:00:00",
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    const renderPage = (dataOverride = {}, csvOverride = {}) => {
        let currentData = {...baseData, ...dataOverride};
        let currentCsv = {...baseCsv, ...csvOverride};
        const setData = jest.fn((nextValue) => {
            currentData = typeof nextValue === "function" ? nextValue(currentData) : nextValue;
        });
        const setCsvData = jest.fn((nextValue) => {
            currentCsv = typeof nextValue === "function" ? nextValue(currentCsv) : nextValue;
        });

        render(
            <DataContext.Provider value={{data: currentData, setData}}>
                <CsvContext.Provider value={{csvData: currentCsv, setCsvData}}>
                    <Setup />
                </CsvContext.Provider>
            </DataContext.Provider>
        );

        return {setData, setCsvData};
    };

    it("redirects to home when process id is missing", () => {
        renderPage({id: ""});
        expect(replaceMock).toHaveBeenCalledWith("/");
    });

    it("submits data and navigates to the simulation page", async () => {
        (axios.post as jest.Mock).mockResolvedValue({data: {id: "proc-2"}});
        renderPage();

        fireEvent.click(screen.getByRole("button", {name: "run-submit"}));

        await waitFor(() => {
            expect(axios.post).toHaveBeenCalledWith("/api/simulation", expect.any(FormData));
        });
        expect(pushMock).toHaveBeenCalledWith("/simulation/proc-2");
    });

    it("shows an error toast when submit fails", async () => {
        (axios.post as jest.Mock).mockRejectedValue({response: {data: {error: "bad request"}}});
        renderPage();

        fireEvent.click(screen.getByRole("button", {name: "run-submit"}));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith("Error occurred!", {description: "bad request"});
        });
    });

    it("runs mapping and config step callbacks", () => {
        const {setData, setCsvData} = renderPage();

        fireEvent.click(screen.getByRole("button", {name: /next-Setup the log mapping/i}));
        fireEvent.click(screen.getByRole("button", {name: /next-Setup your experiment/i}));

        expect(setData).toHaveBeenCalled();
        expect(setCsvData).toHaveBeenCalled();
    });

    it("shows BPMN error when upload step validation fails", () => {
        renderPage({bpmnFile: null, jsonFile: null});

        fireEvent.click(screen.getByRole("button", {name: /next-Upload the BPMN model and JSON file/i}));

        expect(toast.error).toHaveBeenCalledWith("Invalid BPMN", {description: "You have to upload a BPMN model!"});
    });

    it("accepts upload-step validation when both BPMN and JSON files exist", () => {
        renderPage();

        fireEvent.click(screen.getByRole("button", {name: /next-Upload the BPMN model and JSON file/i}));

        expect(toast.error).not.toHaveBeenCalledWith("Invalid BPMN", expect.anything());
        expect(toast.error).not.toHaveBeenCalledWith("Invalid JSON", expect.anything());
    });

    it("shows JSON error when BPMN exists but JSON is missing", () => {
        renderPage({jsonFile: null});

        fireEvent.click(screen.getByRole("button", {name: /next-Upload the BPMN model and JSON file/i}));

        expect(toast.error).toHaveBeenCalledWith("Invalid JSON", {description: "You have to upload a JSON file!"});
    });

    it("shows invalid mapping error when duplicated columns are used", () => {
        renderPage();

        fireEvent.click(screen.getByRole("button", {name: /next-invalid-Setup the log mapping/i}));

        expect(toast.error).toHaveBeenCalledWith(
            "Invalid mapping",
            {description: "You assigned the same column to multiple attributes!"}
        );
    });

    it("shows invalid configuration error when a required value is missing", () => {
        renderPage();

        fireEvent.click(screen.getByRole("button", {name: /next-invalid-Setup your experiment/i}));

        expect(toast.error).toHaveBeenCalledWith(
            "Invalid configuration",
            {description: "You have to set a value for every configuration parameter!"}
        );
    });

    it("shows invalid configuration error when experiment form is empty", () => {
        renderPage();

        fireEvent.click(screen.getByRole("button", {name: /next-empty-Setup your experiment/i}));

        expect(toast.error).toHaveBeenCalledWith(
            "Invalid configuration",
            {description: "You have to set a value for every configuration parameter!"}
        );
    });

    it("prevents duplicate submit calls while already submitting", async () => {
        let resolvePost: (value: unknown) => void;
        (axios.post as jest.Mock).mockReturnValue(new Promise((resolve) => {
            resolvePost = resolve;
        }));
        renderPage();

        fireEvent.click(screen.getByRole("button", {name: "run-submit"}));
        fireEvent.click(screen.getByRole("button", {name: "run-submit"}));

        await waitFor(() => {
            expect(axios.post).toHaveBeenCalledTimes(1);
        });

        resolvePost!({data: {id: "proc-2"}});
        await waitFor(() => {
            expect(pushMock).toHaveBeenCalledWith("/simulation/proc-2");
        });
    });

    it("renders validate preview values including Discover mapping", () => {
        renderPage({
            mapping: {
                case: "case",
                activity: "__DISCOVER__",
                enablement: "enablement",
                start: "start",
                end: "end",
                resource: "resource",
                attributes: {extra: "extra"},
            },
        });

        expect(screen.getByText("Discover")).toBeInTheDocument();
        expect(screen.getByText("model.bpmn")).toBeInTheDocument();
        expect(screen.getByText("params.json")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: /next-Validate configuration/i}));
    });
});

