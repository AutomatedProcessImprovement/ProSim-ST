import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import FileForm from "@components/fileHandlers/FileForm";
import {DataContext} from "@context/DataContext";
import {CsvContext} from "@context/CsvContext";
import {parseCsvFile} from "@utils/fileHelpers";
import {TimeUnits} from "@definitions/config/enums";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
    useRouter: () => ({push: mockPush}),
}));

jest.mock("uuid", () => ({
    v4: () => "generated-process-id",
}));

jest.mock("@utils/fileHelpers", () => ({
    parseCsvFile: jest.fn(),
}));

jest.mock("@components/fileHandlers/FileInput", () => ({
    __esModule: true,
    default: ({onChange}) => (
        <>
            <button onClick={() => onChange([new File(["csv"], "log.csv", {type: "text/csv"})])}>pick-file</button>
            <button onClick={() => onChange([
                new File(["csv"], "log.csv", {type: "text/csv"}),
                new File(["csv"], "log.csv", {type: "text/csv"}),
            ])}>pick-duplicate-files</button>
        </>
    ),
}));

jest.mock("@components/fileHandlers/FileItem", () => ({
    __esModule: true,
    default: ({file, onRemove, onOpen}) => (
        <div>
            <span>{file.name}</span>
            {onOpen && <button onClick={() => onOpen(file)}>open-file</button>}
            <button onClick={() => onRemove(file)}>remove-file</button>
        </div>
    ),
}));

jest.mock("@components/fileHandlers/FilePreview", () => ({
    __esModule: true,
    default: ({file, onClose}) => (
        <div data-testid="file-preview">
            {file ? (
                <>
                    <span>{file.name}</span>
                    <button onClick={onClose}>close-preview</button>
                </>
            ) : null}
        </div>
    ),
}));

describe("FileForm", () => {
    const mockParseCsvFile = parseCsvFile as jest.MockedFunction<typeof parseCsvFile>;
    const baseDataContext = {
        data: {
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
        },
        setData: jest.fn(),
    };
    const baseCsvContext = {
        csvData: {
            headers: [],
            firstLine: [],
            lastLine: [],
            logStartDate: "",
            logEndDate: "",
        },
        setCsvData: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("parses the selected CSV, stores derived context, and navigates to setup", async () => {
        mockParseCsvFile.mockResolvedValue({
            fileHeaders: ["case", "activity"],
            fileFirstLine: ["1", "Register"],
            fileLastLine: ["2", "Approve"],
        });

        render(
            <DataContext.Provider value={baseDataContext}>
                <CsvContext.Provider value={baseCsvContext}>
                    <FileForm />
                </CsvContext.Provider>
            </DataContext.Provider>
        );

        fireEvent.click(screen.getByRole("button", {name: "pick-file"}));
        fireEvent.click(screen.getByRole("button", {name: /configure & run/i}));

        await waitFor(() => expect(mockParseCsvFile).toHaveBeenCalledTimes(1));
        expect(baseDataContext.setData).toHaveBeenCalled();
        expect(baseCsvContext.setCsvData).toHaveBeenCalled();

        const dataUpdater = baseDataContext.setData.mock.calls[baseDataContext.setData.mock.calls.length - 1][0];
        const nextData = dataUpdater(baseDataContext.data);
        expect(nextData.id).toBe("generated-process-id");
        expect(nextData.logFile).toBeInstanceOf(File);
        expect(nextData.logFile.name).toBe("log.csv");

        const csvUpdater = baseCsvContext.setCsvData.mock.calls[baseCsvContext.setCsvData.mock.calls.length - 1][0];
        expect(csvUpdater(baseCsvContext.csvData)).toEqual({
            ...baseCsvContext.csvData,
            headers: ["case", "activity"],
            firstLine: ["1", "Register"],
            lastLine: ["2", "Approve"],
        });
        expect(mockPush).toHaveBeenCalledWith("/setup");
    });

    it("disables submission again after removing the selected file", () => {
        render(
            <DataContext.Provider value={baseDataContext}>
                <CsvContext.Provider value={baseCsvContext}>
                    <FileForm />
                </CsvContext.Provider>
            </DataContext.Provider>
        );

        const submitButton = screen.getByRole("button", {name: /configure & run/i});
        expect(submitButton).toBeDisabled();

        fireEvent.click(screen.getByRole("button", {name: "pick-file"}));
        expect(submitButton).toBeEnabled();

        fireEvent.click(screen.getByRole("button", {name: "remove-file"}));
        expect(submitButton).toBeDisabled();
    });

    it("opens and closes the file preview through the item callbacks", () => {
        render(
            <DataContext.Provider value={baseDataContext}>
                <CsvContext.Provider value={baseCsvContext}>
                    <FileForm />
                </CsvContext.Provider>
            </DataContext.Provider>
        );

        fireEvent.click(screen.getByRole("button", {name: "pick-file"}));
        fireEvent.click(screen.getByRole("button", {name: "open-file"}));

        expect(screen.getByTestId("file-preview")).toHaveTextContent("log.csv");

        fireEvent.click(screen.getByRole("button", {name: "close-preview"}));

        expect(screen.getByTestId("file-preview")).not.toHaveTextContent("log.csv");
    });

    it("filters duplicate files when the picker provides the same file twice", () => {
        render(
            <DataContext.Provider value={baseDataContext}>
                <CsvContext.Provider value={baseCsvContext}>
                    <FileForm />
                </CsvContext.Provider>
            </DataContext.Provider>
        );

        fireEvent.click(screen.getByRole("button", {name: "pick-duplicate-files"}));

        expect(screen.getAllByText("log.csv")).toHaveLength(1);
    });

});



