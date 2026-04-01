import {Batch, Token, Tokens} from "@definitions/simulation/types";

export type CoordinateMap = Record<string, Record<string, Array<Token>>>;

export function prependCurrentBatchIfNeeded(
    batchesQueue: Batch[],
    currentBatch: Batch,
    localProgress: number,
): Batch[] {
    if (!localProgress) return [...batchesQueue];
    return [currentBatch, ...batchesQueue];
}

export function buildVisualResetPatch(localProgress: number): {
    tokens: Tokens;
    coordinateMap: CoordinateMap;
    isResumed: boolean;
} {
    return {
        tokens: {} as Tokens,
        coordinateMap: {},
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
        nextQueue: prependCurrentBatchIfNeeded(input.batchesQueue, input.currentBatch, input.localProgress),
        resetPatch: buildVisualResetPatch(input.localProgress),
    };
}

export function decidePlaybackSpeedUpdateAction(input: PlaybackSpeedDecisionInput): PlaybackSpeedDecision {
    if (input.isPaused) {
        return {kind: "paused"};
    }

    return {
        kind: "running",
        nextQueue: prependCurrentBatchIfNeeded(input.batchesQueue, input.currentBatch, input.localProgress),
        resetPatch: buildVisualResetPatch(input.localProgress),
    };
}


