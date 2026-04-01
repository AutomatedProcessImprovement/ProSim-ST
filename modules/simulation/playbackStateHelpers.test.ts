import {Batch} from "@definitions/simulation/types";
import {
    buildVisualResetPatch,
    calculatePlaybackDelta,
    decidePlaybackSpeedUpdateAction,
    decidePlayPauseResumeAction,
    prependCurrentBatchIfNeeded,
} from "@modules/simulation/playbackStateHelpers";

function makeBatch(label: string): Batch {
    return {
        startDate: `${label}-start`,
        endDate: `${label}-end`,
        events: [],
    };
}

describe("prependCurrentBatchIfNeeded", () => {
    it("prepends current batch when local progress exists", () => {
        const queue = [makeBatch("queued")];
        const current = makeBatch("current");

        const next = prependCurrentBatchIfNeeded(queue, current, 0.4);

        expect(next[0]).toBe(current);
        expect(next[1]).toBe(queue[0]);
    });

    it("returns a copy without prepending when local progress is zero", () => {
        const queue = [makeBatch("queued")];
        const current = makeBatch("current");

        const next = prependCurrentBatchIfNeeded(queue, current, 0);

        expect(next).toEqual(queue);
        expect(next).not.toBe(queue);
    });
});

describe("buildVisualResetPatch", () => {
    it("builds a reset patch and marks resume based on local progress", () => {
        const patch = buildVisualResetPatch(0.25);

        expect(patch.tokens).toEqual({});
        expect(patch.coordinateMap).toEqual({});
        expect(patch.isResumed).toBe(true);
    });

    it("marks isResumed false when local progress is zero", () => {
        const patch = buildVisualResetPatch(0);
        expect(patch.isResumed).toBe(false);
    });
});

describe("calculatePlaybackDelta", () => {
    it("calculates delta from default delta and selected speed", () => {
        expect(calculatePlaybackDelta(2000, 2)).toBe(1000);
    });
});

describe("decidePlayPauseResumeAction", () => {
    it("returns pause when simulation is currently running", () => {
        const result = decidePlayPauseResumeAction({
            isPaused: false,
            hasEnded: false,
            batchesQueue: [makeBatch("queued")],
            currentBatch: makeBatch("current"),
            localProgress: 0.2,
        });

        expect(result).toEqual({kind: "pause"});
    });

    it("returns restart when simulation is paused and has ended", () => {
        const result = decidePlayPauseResumeAction({
            isPaused: true,
            hasEnded: true,
            batchesQueue: [makeBatch("queued")],
            currentBatch: makeBatch("current"),
            localProgress: 0.2,
        });

        expect(result).toEqual({kind: "restart"});
    });

    it("returns resume patch and prepended queue when local progress exists", () => {
        const queued = makeBatch("queued");
        const current = makeBatch("current");

        const result = decidePlayPauseResumeAction({
            isPaused: true,
            hasEnded: false,
            batchesQueue: [queued],
            currentBatch: current,
            localProgress: 0.2,
        });

        expect(result.kind).toBe("resume");
        if (result.kind !== "resume") throw new Error("Expected resume decision");
        expect(result.nextQueue[0]).toBe(current);
        expect(result.nextQueue[1]).toBe(queued);
        expect(result.resetPatch.isResumed).toBe(true);
    });

    it("returns resume patch without prepending when local progress is zero", () => {
        const queued = makeBatch("queued");
        const current = makeBatch("current");

        const result = decidePlayPauseResumeAction({
            isPaused: true,
            hasEnded: false,
            batchesQueue: [queued],
            currentBatch: current,
            localProgress: 0,
        });

        expect(result.kind).toBe("resume");
        if (result.kind !== "resume") throw new Error("Expected resume decision");
        expect(result.nextQueue).toEqual([queued]);
        expect(result.resetPatch.isResumed).toBe(false);
    });
});

describe("decidePlaybackSpeedUpdateAction", () => {
    it("returns paused decision when playback is currently paused", () => {
        const result = decidePlaybackSpeedUpdateAction({
            isPaused: true,
            batchesQueue: [makeBatch("queued")],
            currentBatch: makeBatch("current"),
            localProgress: 0.3,
        });

        expect(result).toEqual({kind: "paused"});
    });

    it("returns running decision and prepends current batch when local progress exists", () => {
        const queued = makeBatch("queued");
        const current = makeBatch("current");

        const result = decidePlaybackSpeedUpdateAction({
            isPaused: false,
            batchesQueue: [queued],
            currentBatch: current,
            localProgress: 0.3,
        });

        expect(result.kind).toBe("running");
        if (result.kind !== "running") throw new Error("Expected running decision");
        expect(result.nextQueue[0]).toBe(current);
        expect(result.nextQueue[1]).toBe(queued);
        expect(result.resetPatch.isResumed).toBe(true);
    });

    it("returns running decision without prepending when local progress is zero", () => {
        const queued = makeBatch("queued");
        const current = makeBatch("current");

        const result = decidePlaybackSpeedUpdateAction({
            isPaused: false,
            batchesQueue: [queued],
            currentBatch: current,
            localProgress: 0,
        });

        expect(result.kind).toBe("running");
        if (result.kind !== "running") throw new Error("Expected running decision");
        expect(result.nextQueue).toEqual([queued]);
        expect(result.resetPatch.isResumed).toBe(false);
    });
});

