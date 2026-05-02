export type StressTestState = {
    currentConcurrent: number;
    peakConcurrent: number;
    totalFinished: number;
    concurrencyHistory: number[];
};

export const SCALE_OPTIONS = [1, 2, 5, 10] as const;
export type ScaleFactor = typeof SCALE_OPTIONS[number];

export const INITIAL_STRESS_TEST_STATE: StressTestState = {
    currentConcurrent: 0,
    peakConcurrent: 0,
    totalFinished: 0,
    concurrencyHistory: [],
};