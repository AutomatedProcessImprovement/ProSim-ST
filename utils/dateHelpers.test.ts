import {calculateEndDate, formatDateString, getHourDifference} from "@utils/dateHelpers";
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
});

