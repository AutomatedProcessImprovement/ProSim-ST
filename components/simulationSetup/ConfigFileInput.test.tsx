import {fireEvent, render, screen} from "@testing-library/react";
import ConfigFileInput from "@components/simulationSetup/ConfigFileInput";
import {DataContext} from "@context/DataContext";
import {FileTypes, TimeUnits} from "@definitions/config/enums";

jest.mock("@components/fileHandlers/FileInput", () => ({
    __esModule: true,
    default: ({onChange, accepts, type}) => (
        <button
            data-testid="file-input"
            data-accepts={JSON.stringify(accepts)}
            onClick={() => onChange([
                new File(["content"], type === FileTypes.JSON ? "config.json" : "process.bpmn", {
                    type: type === FileTypes.JSON ? "application/json" : "text/bpmn",
                }),
            ])}
        >
            add-file
        </button>
    ),
}));

jest.mock("@components/fileHandlers/FileItem", () => ({
    __esModule: true,
    default: ({file, onRemove}) => (
        <div>
            <span>{file.name}</span>
            <button onClick={() => onRemove(file)}>remove-file</button>
        </div>
    ),
}));

describe("ConfigFileInput", () => {
    const baseData = {
        id: "",
        mapping: {},
        config: {
            simulationHorizonValue: 8,
            simulationHorizonUnit: TimeUnits.WEEKS,
            startingPoint: "",
        },
        logFile: null,
        bpmnFile: null,
        jsonFile: null,
    };

    it("renders an existing BPMN file and clears it when removed", () => {
        const setData = jest.fn();

        render(
            <DataContext.Provider value={{
                data: {...baseData, bpmnFile: new File(["xml"], "existing.bpmn", {type: "text/bpmn"})},
                setData,
            }}>
                <ConfigFileInput type={FileTypes.BPMN} />
            </DataContext.Provider>
        );

        expect(screen.getByText("existing.bpmn")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: "remove-file"}));

        const updater = setData.mock.calls[0][0];
        expect(updater({...baseData, bpmnFile: new File([], "existing.bpmn")})).toEqual({
            ...baseData,
            bpmnFile: null,
        });
    });

    it("accepts a JSON file and stores it in context", () => {
        const setData = jest.fn();

        render(
            <DataContext.Provider value={{data: baseData, setData}}>
                <ConfigFileInput type={FileTypes.JSON} />
            </DataContext.Provider>
        );

        expect(screen.getByTestId("file-input")).toHaveAttribute(
            "data-accepts",
            JSON.stringify({"application/json": [".json"]})
        );

        fireEvent.click(screen.getByRole("button", {name: "add-file"}));

        const updater = setData.mock.calls[0][0];
        const nextData = updater(baseData);
        expect(nextData.jsonFile).toBeInstanceOf(File);
        expect(nextData.jsonFile.name).toBe("config.json");
    });

    it("renders the BPMN input with the expected accepted type when no file exists", () => {
        render(
            <DataContext.Provider value={{data: baseData, setData: jest.fn()}}>
                <ConfigFileInput type={FileTypes.BPMN} />
            </DataContext.Provider>
        );

        expect(screen.getByTestId("file-input")).toHaveAttribute(
            "data-accepts",
            JSON.stringify({"text/bpmn": [".bpmn"]})
        );
    });

    it("accepts a BPMN file and stores it in context", () => {
        const setData = jest.fn();

        render(
            <DataContext.Provider value={{data: baseData, setData}}>
                <ConfigFileInput type={FileTypes.BPMN} />
            </DataContext.Provider>
        );

        fireEvent.click(screen.getByRole("button", {name: "add-file"}));

        const updater = setData.mock.calls[0][0];
        const nextData = updater(baseData);
        expect(nextData.bpmnFile).toBeInstanceOf(File);
        expect(nextData.bpmnFile.name).toBe("process.bpmn");
    });

    it("renders an existing JSON file and clears it when removed", () => {
        const setData = jest.fn();

        render(
            <DataContext.Provider value={{
                data: {...baseData, jsonFile: new File(["{}"], "existing.json", {type: "application/json"})},
                setData,
            }}>
                <ConfigFileInput type={FileTypes.JSON} />
            </DataContext.Provider>
        );

        expect(screen.getByText("existing.json")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: "remove-file"}));

        const updater = setData.mock.calls[0][0];
        expect(updater({...baseData, jsonFile: new File([], "existing.json")})).toEqual({
            ...baseData,
            jsonFile: null,
        });
    });
});


