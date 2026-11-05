import {
    batchFetchLimit,
    batchTopUpThreshold,
    isSummarySpeed,
    msPerSimulatedHour,
    SPEEDS,
} from "@modules/simulation/speed";

describe("playback speeds", () => {
    it("offers speeds from half an hour to a week per second", () => {
        expect(SPEEDS[0]).toEqual({hoursPerSecond: 0.5, label: "30 min/s"});
        expect(SPEEDS[SPEEDS.length - 1]).toEqual({hoursPerSecond: 168, label: "1 week/s"});
    });

    it("switches to jumping dots from 6 hours per second", () => {
        expect(isSummarySpeed(msPerSimulatedHour(3))).toBe(false);
        expect(isSummarySpeed(msPerSimulatedHour(6))).toBe(true);
    });

    it("loads about four seconds of batches, between 15 and 720", () => {
        expect(batchFetchLimit(msPerSimulatedHour(1))).toBe(15);
        expect(batchFetchLimit(msPerSimulatedHour(24))).toBe(96);
        expect(batchFetchLimit(msPerSimulatedHour(168))).toBe(672);
        expect(batchTopUpThreshold(msPerSimulatedHour(1))).toBe(5);
        expect(batchTopUpThreshold(msPerSimulatedHour(72))).toBe(144);
    });
});
