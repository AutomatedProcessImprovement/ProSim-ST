import {calculateEndDate, formatDateString, formatDuration, formatHorizon, formatInLogTime, formatReadableDate, formatShortDate, formatUtcOffset, getHourDifference, logTimeToUtc, toOffsetIso, formatLogMoment} from "@utils/dateHelpers";
import {TimeUnits} from "@definitions/config/enums";

describe("dateHelpers", () => {
    it("calculates end dates for days, weeks, and months", () => {
        expect(calculateEndDate({
            startingPoint: "2024-01-15T08:30:00",
            simulationHorizonValue: 2,
            simulationHorizonUnit: TimeUnits.DAYS,
        }).toISOString()).toBe("2024-01-17T08:30:00.000Z");

        expect(calculateEndDate({
            startingPoint: "2024-01-15T08:30:00",
            simulationHorizonValue: 3,
            simulationHorizonUnit: TimeUnits.WEEKS,
        }).toISOString()).toBe("2024-02-05T08:30:00.000Z");

        expect(calculateEndDate({
            startingPoint: "2024-01-15T08:30:00",
            simulationHorizonValue: 2,
            simulationHorizonUnit: TimeUnits.MONTHS,
        }).toISOString()).toBe("2024-03-15T08:30:00.000Z");
    });

    it("formats dates for SQL-friendly timestamps", () => {
        expect(formatDateString(new Date("2024-02-01T12:34:56.789Z"))).toBe("2024-02-01 12:34:56");
    });

    it("returns the absolute ceiling hour difference", () => {
        const first = new Date("2024-01-01T00:00:00.000Z");
        const second = new Date("2024-01-01T02:10:00.000Z");

        expect(getHourDifference(first, second)).toBe(3);
        expect(getHourDifference(second, first)).toBe(3);
    });

    it("converts log wall-clock time to UTC and back using the log's UTC offset", () => {
        const utc = logTimeToUtc("2025-04-04T15:46:14", "+02:00");
        expect(utc.toISOString()).toBe("2025-04-04T13:46:14.000Z");
        expect(formatInLogTime(utc, "+02:00")).toBe("2025-04-04 15:46:14");

        expect(logTimeToUtc("2025-04-04T15:46", "-05:30").toISOString()).toBe("2025-04-04T21:16:00.000Z");
        expect(formatInLogTime(new Date("2025-04-04T13:46:14Z"))).toBe("2025-04-04 13:46:14");
        expect(formatUtcOffset("+02:00")).toBe("UTC+02:00");
    });

    it("formats dates and horizons for people", () => {
        expect(formatReadableDate("2025-04-04T15:46:14")).toBe("4 Apr 2025, 15:46");
        expect(formatReadableDate(new Date("2025-05-30T15:46:14Z"))).toBe("30 May 2025, 15:46");
        expect(formatReadableDate("")).toBe("");
        expect(formatHorizon(8, "weeks")).toBe("8 weeks");
        expect(formatHorizon(1, "months")).toBe("1 month");
    });
});

describe("formatDuration", () => {
    it("says durations the way an analyst would", () => {
        expect(formatDuration(-5)).toBe("0 min");
        expect(formatDuration(45 * 60000)).toBe("45 min");
        expect(formatDuration(3 * 3600000)).toBe("3 h");
        expect(formatDuration((6 * 60 + 12) * 60000)).toBe("6 h 12 min");
        expect(formatDuration(48 * 3600000)).toBe("2 d");
        expect(formatDuration(52 * 3600000 + 59 * 60000)).toBe("2 d 4 h");
    });
});

describe("formatShortDate", () => {
    it("formats a date in the log's offset, with or without the time", () => {
        const date = new Date("2025-05-30T22:30:00Z");
        expect(formatShortDate(date)).toBe("30 May");
        expect(formatShortDate(date, "+02:00")).toBe("31 May");
        expect(formatShortDate(date, "+02:00", true)).toBe("31 May 00:30");
    });
});

describe("toOffsetIso", () => {
    it("writes the same moment on the log's wall clock", () => {
        expect(toOffsetIso(new Date("2024-01-01T08:00:00Z"), "+02:00")).toBe("2024-01-01T10:00:00.000+02:00");
        expect(toOffsetIso(new Date("2024-01-01T08:00:00Z"))).toBe("2024-01-01T08:00:00.000+00:00");
    });
});

describe("calculateEndDate", () => {
    it("adds whole days of log time, whatever clock change the machine goes through", () => {
        const end = calculateEndDate({
            startingPoint: "2025-03-28T17:09:00",
            simulationHorizonValue: 8,
            simulationHorizonUnit: TimeUnits.WEEKS,
        });
        expect(end.toISOString()).toBe("2025-05-23T17:09:00.000Z");
    });
});

describe("formatLogMoment", () => {
    it("writes a moment on the log's wall clock", () => {
        expect(formatLogMoment(new Date("2025-04-04T13:46:14Z"), "+02:00")).toBe("4 Apr 2025, 15:46");
    });
});
