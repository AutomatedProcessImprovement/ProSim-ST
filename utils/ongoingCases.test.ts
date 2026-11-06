import {buildCaseSpans, countOngoingCases, openCasesOverTime, parseLogTimestamp} from "@utils/ongoingCases";

describe("ongoingCases", () => {
    const lines = [
        "CaseId,Activity,StartTime,EndTime",
        "1,A,2025-04-04 08:00:00.000000+02:00,2025-04-04 09:00:00.000000+02:00",
        "1,B,2025-04-04 10:00:00.000000+02:00,2025-04-04 12:00:00.000000+02:00",
        "2,A,2025-04-04 11:00:00.000000+02:00,2025-04-04 11:30:00.000000+02:00",
        "3,A,2025-04-04 13:00:00.000000+02:00,2025-04-04 14:00:00.000000+02:00",
    ];
    const spans = buildCaseSpans(lines, "CaseId", "StartTime", "EndTime");
    const at = (wallClock: string) => parseLogTimestamp(wallClock + "+02:00");

    it("parses timestamps with an offset, and without one as UTC", () => {
        expect(new Date(parseLogTimestamp("2025-04-04 15:46:14.387685+02:00")).toISOString()).toBe("2025-04-04T13:46:14.387Z");
        expect(new Date(parseLogTimestamp("2025-04-04 15:46:14")).toISOString()).toBe("2025-04-04T15:46:14.000Z");
        expect(parseLogTimestamp("")).toBeNaN();
    });

    it("counts cases that started before the moment and have activities ending after it", () => {
        expect(countOngoingCases(spans, at("2025-04-04T07:00:00"))).toBe(0);
        expect(countOngoingCases(spans, at("2025-04-04T09:30:00"))).toBe(1);
        expect(countOngoingCases(spans, at("2025-04-04T11:15:00"))).toBe(2);
        expect(countOngoingCases(spans, at("2025-04-04T14:00:00"))).toBe(0);
    });

    it("follows the open cases across the log and finds the busiest moment", () => {
        const series = openCasesOverTime(spans, 7);
        expect(series.from).toBe(at("2025-04-04T08:00:00"));
        expect(series.to).toBe(at("2025-04-04T14:00:00"));
        expect(series.counts).toEqual([1, 1, 1, 2, 0, 1, 0]);
        expect(series.peak).toBe(2);
        expect(series.peakMoment).toBe(at("2025-04-04T11:00:00"));
    });

    it("has no series for an empty log", () => {
        expect(openCasesOverTime({starts: new Float64Array(), ends: new Float64Array()})).toBeNull();
    });

    it("returns no spans when the mapped columns are not in the log", () => {
        expect(buildCaseSpans(lines, "case", "StartTime", "EndTime").starts.length).toBe(0);
    });
});
