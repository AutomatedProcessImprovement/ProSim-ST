import {calculateEndDate, formatDateString, formatHorizon, formatInLogTime, formatReadableDate, formatUtcOffset, getHourDifference, logTimeToUtc} from "@utils/dateHelpers";
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
