import {ComparisonResponse, ScenarioEdits, SeedChange, WhatIfOptions} from "@definitions/api/types";

export const MIN_SEEDS_FOR_VERDICT = 5;
export const MIN_PERCENT = -90;
export const MAX_PERCENT = 300;
export const MAX_POOL_SIZE = 500;

export const NO_EDITS: ScenarioEdits = {pools: {}, arrivalPercent: 0, tasks: {}};

const isIntegerRecord = (value: unknown): value is Record<string, number> =>
    typeof value === "object" && value !== null && !Array.isArray(value)
    && Object.values(value).every(Number.isInteger);

export const parseEdits = (value: unknown): ScenarioEdits | null => {
    const edits = value as Partial<ScenarioEdits> | null;
    if (!edits || typeof edits !== "object") return null;
    const pools = edits.pools ?? {};
    const tasks = edits.tasks ?? {};
    const arrivalPercent = edits.arrivalPercent ?? 0;
    if (!isIntegerRecord(pools) || !isIntegerRecord(tasks) || !Number.isInteger(arrivalPercent)) return null;
    const percents = [arrivalPercent, ...Object.values(tasks)];
    if (percents.some(percent => percent < MIN_PERCENT || percent > MAX_PERCENT)) return null;
    if (Object.values(pools).some(size => size < 1 || size > MAX_POOL_SIZE)) return null;
    return {pools, tasks, arrivalPercent};
};

export const changedEdits = (edits: ScenarioEdits, options: Pick<WhatIfOptions, "pools">): ScenarioEdits => ({
    pools: Object.fromEntries(Object.entries(edits.pools).filter(([id, size]) =>
        options.pools.find(pool => pool.id === id)?.size !== size)),
    arrivalPercent: edits.arrivalPercent,
    tasks: Object.fromEntries(Object.entries(edits.tasks).filter(([, percent]) => percent !== 0)),
});

export const hasEdits = (edits: ScenarioEdits) =>
    Object.keys(edits.pools).length > 0 || edits.arrivalPercent !== 0 || Object.keys(edits.tasks).length > 0;

export const formatPercent = (percent: number) => percent > 0 ? `+${percent}%` : percent < 0 ? `−${-percent}%` : "0%";

export const describeEdits = (edits: ScenarioEdits, options: Pick<WhatIfOptions, "pools" | "tasks">) => [
    ...options.pools.filter(pool => edits.pools[pool.id] !== undefined)
        .map(pool => `${pool.name} ${pool.size} → ${edits.pools[pool.id]}`),
    ...(edits.arrivalPercent ? [`Arrivals ${formatPercent(edits.arrivalPercent)}`] : []),
    ...options.tasks.filter(task => edits.tasks[task.id] !== undefined)
        .map(task => `${task.name} ${formatPercent(edits.tasks[task.id])}`),
].join(" · ");

export type Verdict = "better" | "worse" | "chance" | "unknown";

export const verdictOf = (change: SeedChange | undefined, seeds: number, higherIsBetter = false): Verdict => {
    if (seeds < MIN_SEEDS_FOR_VERDICT || !change || change.low === null || change.high === null) return "unknown";
    const up = change.low > 0;
    const down = change.high < 0;
    if (!up && !down) return "chance";
    return up === higherIsBetter ? "better" : "worse";
};

export const VERDICT_LABELS: Record<Verdict, string> = {
    better: "Clearly better",
    worse: "Clearly worse",
    chance: "Could be chance",
    unknown: "Not enough repeats",
};

export type TaskComparisonRow = {
    name: string;
    waitAsIs: number | null;
    waitToBe: number | null;
    queueAsIs: number;
    queueToBe: number;
    peakAsIs: number;
    peakToBe: number;
    verdict: Verdict;
};

export const taskComparisonRows = ({comparison}: Pick<ComparisonResponse, "comparison">): TaskComparisonRow[] => {
    const {asIs, toBe, repeats} = comparison;
    const names = [...new Set([...Object.keys(asIs.tasks), ...Object.keys(toBe.tasks)])];
    return names
        .map(name => {
            const before = asIs.tasks[name];
            const after = toBe.tasks[name];
            const change = repeats.tasks[name]?.queueAverage;
            return {
                name,
                waitAsIs: before?.waitMs ?? null,
                waitToBe: after?.waitMs ?? null,
                queueAsIs: before?.queueAverage ?? 0,
                queueToBe: after?.queueAverage ?? 0,
                peakAsIs: before?.queuePeak ?? 0,
                peakToBe: after?.queuePeak ?? 0,
                verdict: verdictOf(change, repeats.seeds),
            };
        })
        .sort((a, b) => Math.abs(b.queueToBe - b.queueAsIs) - Math.abs(a.queueToBe - a.queueAsIs));
};
