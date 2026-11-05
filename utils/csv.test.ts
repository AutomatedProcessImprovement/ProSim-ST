import {toCsv} from "@utils/csv";

describe("utils/csv", () => {
    it("quotes what needs quoting and leaves empty cells blank", () => {
        expect(toCsv(["a", "b"], [['say "hi", ok', null], ["two\nlines", 3]]))
            .toBe('a,b\r\n"say ""hi"", ok",\r\n"two\nlines",3\r\n');
    });

    it("stops text from running as a spreadsheet formula, but keeps negative numbers", () => {
        expect(toCsv(["a"], [["=1+1"], ["@cmd"], [-2]])).toBe("a\r\n'=1+1\r\n'@cmd\r\n-2\r\n");
    });
});
