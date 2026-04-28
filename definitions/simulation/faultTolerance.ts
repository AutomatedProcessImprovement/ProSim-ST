export type FaultToleranceState = {
    faultRate: number;
    batchesDropped: number;
    gapRecoveries: number;
    simulationCrashed: boolean;
};

export const FAULT_RATE_OPTIONS = [0, 0.05, 0.10, 0.20] as const;
export type FaultRate = typeof FAULT_RATE_OPTIONS[number];

export const INITIAL_FAULT_TOLERANCE_STATE: FaultToleranceState = {
    faultRate: 0,
    batchesDropped: 0,
    gapRecoveries: 0,
    simulationCrashed: false,
};