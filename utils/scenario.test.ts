import {changedEdits, describeEdits, hasEdits, NO_EDITS, parseEdits, taskComparisonRows, verdictOf} from "@utils/scenario";
import {Comparison, RunSummary} from "@definitions/api/types";

const options = {
    pools: [{id: "c", name: "Clerk", size: 9}, {id: "o", name: "Officer", size: 2}],
    tasks: [{id: "t1", name: "Check"}, {id: "t2", name: "Approve"}],
};

describe("parseEdits", () => {
    it("fills in what was left out", () => {
        expect(parseEdits({arrivalPercent: 20})).toEqual({pools: {}, tasks: {}, arrivalPercent: 20});
    });

    it("keeps an empty start and refuses a value that is not a yes or no", () => {
        expect(parseEdits({emptyStart: true})).toEqual({pools: {}, tasks: {}, arrivalPercent: 0, emptyStart: true});
        expect(parseEdits({emptyStart: false})).toEqual({pools: {}, tasks: {}, arrivalPercent: 0});
        expect(parseEdits({emptyStart: "yes"})).toBeNull();
    });

    it("counts an empty start as a change and names it", () => {
        const edits = changedEdits({...NO_EDITS, emptyStart: true}, options);
        expect(hasEdits(edits)).toBe(true);
        expect(describeEdits(edits, options)).toBe("Empty start");
    });

    it("refuses anything that is not a whole number in range", () => {
        expect(parseEdits(null)).toBeNull();
        expect(parseEdits({arrivalPercent: "10"})).toBeNull();
        expect(parseEdits({arrivalPercent: 900})).toBeNull();
        expect(parseEdits({tasks: {t1: 1.5}})).toBeNull();
        expect(parseEdits({tasks: {t1: -95}})).toBeNull();
        expect(parseEdits({pools: {c: 0}})).toBeNull();
        expect(parseEdits({pools: []})).toBeNull();
    });
});

describe("changedEdits", () => {
    it("drops values that match the as-is run", () => {
        const edits = changedEdits({pools: {c: 9, o: 3}, arrivalPercent: 0, tasks: {t1: 0, t2: -30}}, options);
        expect(edits).toEqual({pools: {o: 3}, arrivalPercent: 0, tasks: {t2: -30}});
        expect(hasEdits(edits)).toBe(true);
        expect(hasEdits(changedEdits({...NO_EDITS, pools: {c: 9}}, options))).toBe(false);
    });
});

describe("describeEdits", () => {
    it("reads like a sentence an analyst can recognise", () => {
        expect(describeEdits({pools: {c: 11}, arrivalPercent: 20, tasks: {t2: -30}}, options))
            .toBe("Clerk 9 → 11 · Arrivals +20% · Approve −30%");
    });
});

describe("verdictOf", () => {
    const change = (low: number, high: number) => ({mean: (low + high) / 2, low, high});

    it("calls a change clear only when every seed moved the same way", () => {
        expect(verdictOf(change(-5, -1), 9)).toBe("better");
        expect(verdictOf(change(1, 5), 9)).toBe("worse");
        expect(verdictOf(change(-1, 5), 9)).toBe("chance");
        expect(verdictOf(change(0, 0), 9)).toBe("chance");
    });

    it("flips when more is better", () => {
        expect(verdictOf(change(1, 5), 9, true)).toBe("better");
        expect(verdictOf(change(-5, -1), 9, true)).toBe("worse");
    });

    it("does not judge from a couple of seeds", () => {
        expect(verdictOf(change(1, 5), 4)).toBe("unknown");
        expect(verdictOf({mean: null, low: null, high: null}, 9)).toBe("unknown");
        expect(verdictOf(undefined, 9)).toBe("unknown");
    });
});

describe("taskComparisonRows", () => {
    const task = (queueAverage: number) => ({count: 1, waitMs: 1000, queueAverage, queuePeak: 2, queue: [0]});
    const run = (tasks: RunSummary["tasks"]) => ({tasks} as RunSummary);

    it("lists tasks of both runs, biggest queue change first", () => {
        const comparison = {
            asIs: run({A: task(1), B: task(5)}),
            toBe: run({B: task(1), C: task(1.5)}),
            repeats: {seeds: 9, tasks: {B: {queueAverage: {mean: -4, low: -5, high: -3}, waitMs: {mean: 0, low: 0, high: 0}}}},
        } as unknown as Comparison;
        const rows = taskComparisonRows({comparison});
        expect(rows.map(row => row.name)).toEqual(["B", "C", "A"]);
        expect(rows[0].verdict).toBe("better");
        expect(rows[1]).toMatchObject({queueAsIs: 0, waitAsIs: null, verdict: "unknown"});
    });
});
