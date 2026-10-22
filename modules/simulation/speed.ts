// Playback speeds in simulated hours per real second
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

// From this speed on, cases no longer travel along the arrows: an hour would pass in a few frames, so the dots
// jump straight to where the cases are, and the counts and shading carry the picture
export const SUMMARY_MODE_HOURS_PER_SECOND = 6;

// Real milliseconds per simulated hour
export const msPerSimulatedHour = (hoursPerSecond: number) => 1000 / hoursPerSecond;

export const hoursPerSecondOf = (msPerHour: number) => 1000 / msPerHour;

export const isSummarySpeed = (msPerHour: number) => hoursPerSecondOf(msPerHour) >= SUMMARY_MODE_HOURS_PER_SECOND;

// How many hourly batches to keep loaded: about four seconds of playback, at least 15, at most a month
export const batchFetchLimit = (msPerHour: number) =>
    Math.min(720, Math.max(15, Math.ceil(hoursPerSecondOf(msPerHour) * 4)));

// Load more once fewer than about two seconds of playback are left
export const batchTopUpThreshold = (msPerHour: number) =>
    Math.max(5, Math.ceil(hoursPerSecondOf(msPerHour) * 2));
