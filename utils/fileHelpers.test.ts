import {detectDelimiter, getLogUtcOffset, LogFileError, parseCsvFile, readLines, splitCsvLine} from "@utils/fileHelpers";

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

    it("reads tab separated logs and quoted values with separators inside", async () => {
        const file = new File(["unused"], "tabs.csv", {type: "text/csv"});
        fileContents.set(file.name, "case\tactivity\n1\tRegister\n2\tApprove");
        await expect(parseCsvFile(file)).resolves.toMatchObject({fileHeaders: ["case", "activity"]});

        expect(detectDelimiter("a;b;c")).toBe(";");
        expect(detectDelimiter("single")).toBe(",");
        expect(splitCsvLine('1,"Check, again","say ""hi""", x ', ",")).toEqual(["1", "Check, again", 'say "hi"', "x"]);
    });

    it.each([
        ["empty.csv", "", "The file is empty."],
        ["header.csv", "case,activity,start", "The log has a header row but no events."],
        ["one.csv", "case\n1\n2", "Only one column was found."],
        ["book.csv", "PK\u0003\u0004\u0000\u0000rest", "This is not a text CSV file."],
        ["noise.csv", "a,b\n\u0001\ufffd\ufffd\u0002,\ufffd\n", "This is not a text CSV file."],
        ["page.csv", "<!doctype html><html>", "it looks like HTML or XML"],
    ])("explains why %s cannot be used", async (name, content, message) => {
        const file = new File(["unused"], name, {type: "text/csv"});
        fileContents.set(name, content);
        const error = await parseCsvFile(file).catch(caught => caught);
        expect(error).toBeInstanceOf(LogFileError);
        expect(error.message).toContain(message);
    });

    it("reads the UTC offset of a log timestamp, defaulting to UTC", () => {
        expect(getLogUtcOffset("2025-04-04 15:46:14.387685+02:00")).toBe("+02:00");
        expect(getLogUtcOffset("2025-04-04T15:46:14-0330")).toBe("-03:30");
        expect(getLogUtcOffset("2025-04-04 15:46:14")).toBe("+00:00");
        expect(getLogUtcOffset("2025-04-04T15:46:14Z")).toBe("+00:00");
        expect(getLogUtcOffset("2025-04-04")).toBe("+00:00");
        expect(getLogUtcOffset(undefined)).toBe("+00:00");
    });
});
