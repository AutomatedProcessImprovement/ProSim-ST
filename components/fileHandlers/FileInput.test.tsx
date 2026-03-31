import {fireEvent, render, screen} from "@testing-library/react";
import FileInput from "@components/fileHandlers/FileInput";
import {ErrorCode} from "react-dropzone-esm";
import {toast} from "sonner";
import {FileTypes} from "@definitions/config/enums";

const state = {
    isDragActive: false,
    isDragReject: false,
};

const openMock = jest.fn();
let capturedDropzoneConfig: {
    onDropRejected?: (rejections: Array<{ file: { name: string }; errors: Array<{ code: string; message: string }> }>) => void;
};

jest.mock("react-dropzone-esm", () => ({
    ErrorCode: {
        FileTooLarge: "file-too-large",
    },
    useDropzone: jest.fn((config) => {
        capturedDropzoneConfig = config;
        return {
            getRootProps: (props) => props,
            getInputProps: (props) => props,
            open: openMock,
            isDragActive: state.isDragActive,
            isDragReject: state.isDragReject,
        };
    }),
}));

jest.mock("sonner", () => ({
    toast: {
        error: jest.fn(),
    },
}));

describe("FileInput", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        state.isDragActive = false;
        state.isDragReject = false;
    });

    it("renders default message and triggers open when clicking the here button", () => {
        render(
            <FileInput
                onChange={jest.fn()}
                accepts={{"text/csv": [".csv"]}}
                maxSize={1024}
            />
        );

        expect(screen.getByText(/Drop your log file or click/i)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", {name: "here"}));
        expect(openMock).toHaveBeenCalled();
    });

    it("renders drag active and reject states", () => {
        state.isDragActive = true;
        state.isDragReject = false;

        const {rerender} = render(
            <FileInput
                onChange={jest.fn()}
                accepts={{"text/csv": [".csv"]}}
                maxSize={1024}
                message="Upload CSV"
            />
        );
        expect(screen.queryByText(/Only CSV files allowed!/i)).not.toBeInTheDocument();

        state.isDragReject = true;
        rerender(
            <FileInput
                onChange={jest.fn()}
                accepts={{"text/csv": [".csv"]}}
                maxSize={1024}
                type={FileTypes.CSV}
            />
        );

        expect(screen.getByText("Only CSV files allowed!")).toBeInTheDocument();
    });

    it("formats max-size errors and forwards generic rejection errors", () => {
        render(
            <FileInput
                onChange={jest.fn()}
                accepts={{"text/csv": [".csv"]}}
                maxSize={1024}
            />
        );

        capturedDropzoneConfig.onDropRejected([
            {
                file: {name: "big.csv"},
                errors: [{
                    code: ErrorCode.FileTooLarge,
                    message: "File is larger than 1048576 bytes",
                }],
            },
            {
                file: {name: "bad.txt"},
                errors: [{
                    code: "file-invalid-type",
                    message: "Invalid file type",
                }],
            },
        ]);

        expect(toast.error).toHaveBeenCalledWith(
            "Error uploading big.csv",
            expect.objectContaining({description: expect.stringContaining("1 MiB")}),
        );
        expect(toast.error).toHaveBeenCalledWith(
            "Error uploading bad.txt",
            {description: "Invalid file type"},
        );
    });
});



