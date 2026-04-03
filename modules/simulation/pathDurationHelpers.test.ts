import {AnimationData, PathMap} from "@definitions/simulation/types";
import {buildPathMap, calculateDurations, calculatePathLength} from "@modules/simulation/pathDurationHelpers";

describe("calculatePathLength", () => {
    it("returns total euclidean length across segments", () => {
        const length = calculatePathLength([
            {x: 0, y: 0},
            {x: 3, y: 4},
            {x: 6, y: 8},
        ]);

        expect(length).toBe(10);
    });
});

describe("buildPathMap", () => {
    it("builds root tokens and longest subpath lengths", () => {
        const noop = () => {};
        const animationData: AnimationData = {
            A: { path: [{x: 0, y: 0}, {x: 3, y: 0}], nextTokenIds: ["B", "C"], onComplete: noop },
            B: { path: [{x: 3, y: 0}, {x: 6, y: 0}], onComplete: noop },
            C: { path: [{x: 3, y: 0}, {x: 3, y: 4}], onComplete: noop },
        };

        const map = buildPathMap(animationData);

        expect(Object.keys(map)).toEqual(["A"]);
        expect(map.A.longestSubPathLength).toBe(7);
        expect(map.A.subPaths.B.longestSubPathLength).toBe(3);
        expect(map.A.subPaths.C.longestSubPathLength).toBe(4);
    });

    it("ignores child-only token ids at root level", () => {
        const noop = () => {};
        const animationData: AnimationData = {
            Root: { path: [{x: 0, y: 0}, {x: 1, y: 0}], nextTokenIds: ["Child"], onComplete: noop },
            Child: { path: [{x: 1, y: 0}, {x: 2, y: 0}], onComplete: noop },
        };

        const map = buildPathMap(animationData);

        expect(Object.keys(map)).toEqual(["Root"]);
        expect(map.Child).toBeUndefined();
    });
});

describe("calculateDurations", () => {
    it("allocates duration proportionally for non-merging tokens", () => {
        const pathMap: PathMap = {
            A: {
                path: [{x: 0, y: 0}, {x: 4, y: 0}],
                subPaths: {
                    B: { path: [{x: 4, y: 0}, {x: 8, y: 0}], subPaths: {}, longestSubPathLength: 4, onComplete: () => {} },
                    C: { path: [{x: 4, y: 0}, {x: 4, y: 3}], subPaths: {}, longestSubPathLength: 3, onComplete: () => {} },
                },
                longestSubPathLength: 8,
                onComplete: () => {},
            },
        };

        const durations = calculateDurations(pathMap, new Set(), 80);

        expect(durations.A).toBe(40);
    });

    it("synchronizes merging tokens based on remaining path", () => {
        const pathMap: PathMap = {
            A: {
                path: [{x: 0, y: 0}, {x: 2, y: 0}],
                subPaths: {
                    A1: { path: [{x: 2, y: 0}, {x: 5, y: 0}], subPaths: {}, longestSubPathLength: 3, onComplete: () => {} },
                },
                longestSubPathLength: 5,
                onComplete: () => {},
            },
            B: {
                path: [{x: 0, y: 1}, {x: 4, y: 1}],
                subPaths: {
                    B1: { path: [{x: 4, y: 1}, {x: 5, y: 1}], subPaths: {}, longestSubPathLength: 1, onComplete: () => {} },
                },
                longestSubPathLength: 5,
                onComplete: () => {},
            },
        };

        const durations = calculateDurations(pathMap, new Set(), 100);

        expect(durations.A).toBe(40);
        expect(durations.B).toBe(80);
    });

    it("skips tokens that are already animated", () => {
        const pathMap: PathMap = {
            A: {
                path: [{x: 0, y: 0}, {x: 5, y: 0}],
                subPaths: {},
                longestSubPathLength: 5,
                onComplete: () => {},
            },
            B: {
                path: [{x: 0, y: 1}, {x: 5, y: 1}],
                subPaths: {},
                longestSubPathLength: 5,
                onComplete: () => {},
            },
        };

        const durations = calculateDurations(pathMap, new Set(["A"]), 100);

        expect(durations.A).toBeUndefined();
        expect(durations.B).toBe(100);
    });

    it("handles merging comparator branch when later token has longer path", () => {
        const pathMap: PathMap = {
            A: {
                path: [{x: 0, y: 0}, {x: 1, y: 0}],
                subPaths: {
                    A1: { path: [{x: 1, y: 0}, {x: 2, y: 0}], subPaths: {}, longestSubPathLength: 1, onComplete: () => {} },
                },
                longestSubPathLength: 2,
                onComplete: () => {},
            },
            B: {
                path: [{x: 0, y: 1}, {x: 2, y: 1}],
                subPaths: {
                    B1: { path: [{x: 2, y: 1}, {x: 4, y: 1}], subPaths: {}, longestSubPathLength: 2, onComplete: () => {} },
                },
                longestSubPathLength: 4,
                onComplete: () => {},
            },
        };

        const durations = calculateDurations(pathMap, new Set(), 80);

        expect(durations.A).toBe(60);
        expect(durations.B).toBe(40);
    });
});

