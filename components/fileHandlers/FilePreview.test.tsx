import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import FilePreview from "@components/fileHandlers/FilePreview";
import {readLines} from "@utils/fileHelpers";

jest.mock("@utils/fileHelpers", () => ({
    readLines: jest.fn(),
}));

jest.mock("@headlessui/react", () => ({
    Dialog: ({children}) => <div>{children}</div>,
    DialogBackdrop: () => <div data-testid="backdrop" />,
    DialogPanel: ({children, className}) => <div className={className}>{children}</div>,
    DialogTitle: ({children, className}) => <h2 className={className}>{children}</h2>,
}));

describe("FilePreview", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("renders nothing when file is null", () => {
        const {container} = render(<FilePreview file={null} onClose={jest.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });

    it("renders parsed content and close button", async () => {
        (readLines as jest.Mock).mockResolvedValue([
            "case,activity",
            "1,Register",
            "2,Approve",
        ]);
        const onClose = jest.fn();
        const file = new File(["csv"], "log.csv", {type: "text/csv"});

        render(<FilePreview file={file} onClose={onClose} />);

        await waitFor(() => {
            expect(readLines).toHaveBeenCalledWith(file, {removeWhite: true});
        });

        expect(screen.getByText("log.csv")).toBeInTheDocument();
        expect(screen.getByText("case")).toBeInTheDocument();
        expect(screen.getByText("activity")).toBeInTheDocument();
        expect(screen.getByText("Register")).toBeInTheDocument();
        expect(screen.getByText(/And -97 more lines/i)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button"));
        expect(onClose).toHaveBeenCalled();
    });
});

