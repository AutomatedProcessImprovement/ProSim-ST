export const SPEEDS: Array<{hoursPerSecond: number; label: string}> = [
    {hoursPerSecond: 0.5, label: "30 min/s"},
    {hoursPerSecond: 1, label: "1 hour/s"},
    {hoursPerSecond: 3, label: "3 hours/s"},
    {hoursPerSecond: 6, label: "6 hours/s"},
    {hoursPerSecond: 12, label: "12 hours/s"},
    {hoursPerSecond: 24, label: "1 day/s"},
    {hoursPerSecond: 72, label: "3 days/s"},
    {hoursPerSecond: 168, label: "1 week/s"},
];

export const DEFAULT_HOURS_PER_SECOND = 1;

export const SUMMARY_MODE_HOURS_PER_SECOND = 6;

export const msPerSimulatedHour = (hoursPerSecond: number) => 1000 / hoursPerSecond;

export const hoursPerSecondOf = (msPerHour: number) => 1000 / msPerHour;

export const isSummarySpeed = (msPerHour: number) => hoursPerSecondOf(msPerHour) >= SUMMARY_MODE_HOURS_PER_SECOND;

export const batchFetchLimit = (msPerHour: number) =>
    Math.min(720, Math.max(15, Math.ceil(hoursPerSecondOf(msPerHour) * 4)));

export const batchTopUpThreshold = (msPerHour: number) =>
    Math.max(5, Math.ceil(hoursPerSecondOf(msPerHour) * 2));
