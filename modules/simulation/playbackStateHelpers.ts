import {Batch} from "@definitions/simulation/types";

// The batch being played goes back to the front of the queue unless it was fully applied. Without the explicit
// flag, a batch counts as unfinished when its time was partly played.
export function prependCurrentBatchIfNeeded(
    batchesQueue: Batch[],
    currentBatch: Batch,
    localProgress: number,
    currentBatchUnfinished?: boolean,
): Batch[] {
    if (!currentBatch || !(currentBatchUnfinished ?? localProgress)) return [...batchesQueue];
    return [currentBatch, ...batchesQueue];
}

// The dots are cleared and redrawn on resume; a batch interrupted half-way is replayed from where it stopped
export function buildVisualResetPatch(localProgress: number): {
    isResumed: boolean;
} {
    return {
        isResumed: localProgress !== 0,
    };
}

export function calculatePlaybackDelta(defaultDelta: number, newSpeed: number): number {
    return defaultDelta / newSpeed;
}

export type PlayPauseDecisionInput = {
    isPaused: boolean;
    hasEnded: boolean;
    batchesQueue: Batch[];
    currentBatch: Batch;
    localProgress: number;
    currentBatchUnfinished?: boolean;
};

export type PlayPauseDecision =
    | { kind: "pause" }
    | { kind: "restart" }
    | {
        kind: "resume";
        nextQueue: Batch[];
        resetPatch: ReturnType<typeof buildVisualResetPatch>;
    };

export type PlaybackSpeedDecisionInput = {
    isPaused: boolean;
    batchesQueue: Batch[];
    currentBatch: Batch;
    localProgress: number;
    currentBatchUnfinished?: boolean;
};

export type PlaybackSpeedDecision =
    | { kind: "paused" }
    | {
        kind: "running";
        nextQueue: Batch[];
        resetPatch: ReturnType<typeof buildVisualResetPatch>;
    };

export function decidePlayPauseResumeAction(input: PlayPauseDecisionInput): PlayPauseDecision {
    if (!input.isPaused) {
        return {kind: "pause"};
    }

    if (input.hasEnded) {
        return {kind: "restart"};
    }

    return {
        kind: "resume",
        nextQueue: prependCurrentBatchIfNeeded(input.batchesQueue, input.currentBatch, input.localProgress, input.currentBatchUnfinished),
        resetPatch: buildVisualResetPatch(input.localProgress),
    };
}

export function decidePlaybackSpeedUpdateAction(input: PlaybackSpeedDecisionInput): PlaybackSpeedDecision {
    if (input.isPaused) {
        return {kind: "paused"};
    }

    return {
        kind: "running",
        nextQueue: prependCurrentBatchIfNeeded(input.batchesQueue, input.currentBatch, input.localProgress, input.currentBatchUnfinished),
        resetPatch: buildVisualResetPatch(input.localProgress),
    };
}


