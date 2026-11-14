import {checkLogColumns} from "@utils/logCheck";

const MAPPING = {case: "CaseId", activity: "Activity", start: "Start", end: "End", resource: "Resource", enablement: "__DISCOVER__"};
const HEADER = "CaseId,Activity,Start,End,Resource";
const log = (...rows: string[]) => [HEADER, ...rows];

describe("checkLogColumns", () => {
    it("reads the time span and time zone of the whole log, not only its first and last rows", () => {
        expect(checkLogColumns(log(
            "2,B,2025-03-25 12:00:00+02:00,2025-03-25 13:00:00+02:00,Bob",
            "1,A,2025-03-25 09:00:00+02:00,2025-03-25 10:00:00+02:00,Ann",
            "3,C,2025-03-25 10:00:00+02:00,2025-03-25 11:00:00+02:00,",
        ), MAPPING)).toEqual({issues: [], startDate: "2025-03-25T09:00:00", endDate: "2025-03-25T13:00:00", utcOffset: "+02:00"});
    });

    it("takes an empty end time for an activity still in progress, and ends the log at its start", () => {
        expect(checkLogColumns(log(
            "1,A,2025-03-25 09:00:00+02:00,2025-03-25 10:00:00+02:00,Ann",
            "2,B,2025-03-25 10:30:00.400+02:00,,Bob",
        ), MAPPING)).toEqual({issues: [], startDate: "2025-03-25T09:00:00", endDate: "2025-03-25T10:30:01", utcOffset: "+02:00"});
    });

    it("explains timestamps it cannot read", () => {
        const {issues} = checkLogColumns(log("1,A,25/03/2025 09:00,25/03/2025 10:00,Ann"), MAPPING);
        expect(issues).toEqual([
            'The column "Start" (Start timestamp) has values that are not timestamps, e.g. "25/03/2025 09:00" in row 2. Use ISO 8601 timestamps such as 2025-03-25 10:00:00 or 2025-03-25T10:00:00+02:00.',
            expect.stringContaining('The column "End" (End timestamp) has values that are not timestamps'),
        ]);
    });

    it("counts empty cells and events that end before they start", () => {
        expect(checkLogColumns(log(
            "1,,2025-03-25 09:00:00,2025-03-25 10:00:00,Ann",
            "2,B,2025-03-25 09:00:00,,Ann",
        ), MAPPING).issues).toEqual([
            '1 row of the log has an empty column "Activity" (Activity), the first in row 2. Every event needs one.',
        ]);
        expect(checkLogColumns(log("1,A,2025-03-25 09:00:00,,Ann"), MAPPING).issues)
            .toEqual(['1 row of the log has an empty column "End" (End timestamp), the first in row 2. Every event needs one.']);
        expect(checkLogColumns(log("1,A,2025-03-25 10:00:00,2025-03-25 09:00:00,Ann"), MAPPING).issues)
            .toEqual(["1 event ends before it starts, the first in row 2. Check that the start and end columns are mapped the right way round."]);
    });

    it("rejects columns that mix timestamps with and without a time zone", () => {
        expect(checkLogColumns(log(
            "1,A,2025-03-25 09:00:00+02:00,2025-03-25 10:00:00+02:00,Ann",
            "2,A,2025-03-25 09:00:00,2025-03-25 10:00:00+02:00,Ann",
        ), MAPPING).issues).toEqual([expect.stringContaining('"Start" (Start timestamp) mixes timestamps with and without a time zone, e.g. row 3')]);
    });

    it("asks for a column when the mapping points nowhere", () => {
        expect(checkLogColumns(log(), {...MAPPING, resource: "Who"}).issues).toEqual(["Choose a column for Resource."]);
    });
});
