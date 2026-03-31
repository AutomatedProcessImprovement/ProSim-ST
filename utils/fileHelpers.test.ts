import {getCellByHeader, normalizeLogDate, parseCsvFile, readLines} from "@utils/fileHelpers";

const fileContents = new Map<string, string>();
let readerMode: "success" | "error" | "abort" = "success";

class MockFileReader {
    result: string | null = null;
    onabort: null | (() => void) = null;
    onerror: null | (() => void) = null;
    onload: null | (() => void) = null;

    abort() {}

    readAsText(file: File) {
        if (readerMode === "error") {
            this.onerror?.();
            return;
        }

        if (readerMode === "abort") {
            this.onabort?.();
            return;
        }

        this.result = fileContents.get(file.name) ?? "";
        this.onload?.();
    }
}

describe("fileHelpers", () => {
    beforeAll(() => {
        Object.defineProperty(globalThis, "FileReader", {
            configurable: true,
            writable: true,
            value: MockFileReader,
        });
    });

    beforeEach(() => {
        fileContents.clear();
        readerMode = "success";
    });

    it("reads a limited number of lines and removes blank rows when requested", async () => {
        const file = new File(["unused"], "log.csv", {type: "text/csv"});
        fileContents.set(file.name, "header\nvalue\n\nlast");

        await expect(readLines(file, {lines: 2})).resolves.toEqual(["header", "value"]);
        await expect(readLines(file, {removeWhite: true})).resolves.toEqual(["header", "value", "last"]);
    });

    it("rejects when FileReader errors or aborts", async () => {
        const file = new File(["unused"], "broken.csv", {type: "text/csv"});

        readerMode = "error";
        await expect(readLines(file)).rejects.toBe("Error while parsing file broken.csv.");

        readerMode = "abort";
        await expect(readLines(file)).rejects.toBe("Error while parsing file broken.csv.");
    });

    it("parses CSV metadata and supports both comma and semicolon separators", async () => {
        const file = new File(["unused"], "sample.csv", {type: "text/csv"});
        fileContents.set(file.name, "case;activity\n1;Register\n2;Approve");

        await expect(parseCsvFile(file)).resolves.toEqual({
            fileHeaders: ["case", "activity"],
            fileFirstLine: ["1", "Register"],
            fileLastLine: ["2", "Approve"],
        });
    });

    it("looks up cells by header and normalizes timestamp strings", () => {
        expect(getCellByHeader(["1", "Review"], ["case", "activity"], "activity")).toBe("Review");
        expect(getCellByHeader(["1", "Review"], ["case", "activity"], "missing")).toBeUndefined();
        expect(normalizeLogDate("2024-01-02 13:14:15.999")).toBe("2024-01-02T13:14:15");
        expect(normalizeLogDate()).toBeUndefined();
    });
});

