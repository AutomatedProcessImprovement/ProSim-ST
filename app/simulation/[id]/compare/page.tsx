"use client";

import {useEffect, useMemo, useState} from "react";
import {useParams} from "next/navigation";
import Link from "next/link";
import axios from "axios";
import {ComparisonResponse, SeedChange} from "@definitions/api/types";
import {formatDuration, formatShortDate} from "@utils/dateHelpers";
import {MIN_SEEDS_FOR_VERDICT, taskComparisonRows, Verdict, VERDICT_LABELS, verdictOf} from "@utils/scenario";

const CHART_WIDTH = 720;
const CHART_HEIGHT = 150;
const ALL_TASKS = "";

const VERDICT_CLASSES: Record<Verdict, string> = {
    better: "count-working",
    worse: "count-waiting",
    chance: "count-idle",
    unknown: "count-idle",
};

const sign = (value: number) => value > 0 ? "+" : value < 0 ? "−" : "";
const hours = (ms: number | null) => ms === null ? "–" : formatDuration(ms);
const signedHours = (ms: number | null) => ms === null ? "–" : `${sign(ms)}${formatDuration(Math.abs(ms))}`;
const decimal = (value: number) => value.toFixed(1);
const signedDecimal = (value: number) => `${sign(value)}${Math.abs(value).toFixed(1)}`;
const signedCount = (value: number) => `${sign(value)}${Math.abs(Math.round(value))}`;
const share = (value: number | null) => value === null ? "–" : `${Math.round(value * 100)}%`;

const range = (change: SeedChange | undefined, format: (value: number) => string) =>
    change?.low === null || change?.high === null || !change ? "–" : `${format(change.low)} to ${format(change.high)}`;

const line = (values: number[], max: number) => values
    .map((value, index) => {
        const x = values.length > 1 ? index / (values.length - 1) * CHART_WIDTH : 0;
        return `${x.toFixed(1)},${(CHART_HEIGHT - value / max * CHART_HEIGHT).toFixed(1)}`;
    })
    .join(" ");

const VerdictChip = ({verdict}: {verdict: Verdict}) => (
    <span className={`count-chip ${VERDICT_CLASSES[verdict]}`}>{VERDICT_LABELS[verdict]}</span>
);

const Compare = () => {
    const {id} = useParams();
    const processId = Array.isArray(id) ? id[0] : id;
    const [data, setData] = useState<ComparisonResponse | null>(null);
    const [failed, setFailed] = useState<"missing" | "failed" | null>(null);
    const [task, setTask] = useState(ALL_TASKS);

    useEffect(() => {
        axios.get<ComparisonResponse>(`/api/simulation/${processId}/comparison`)
            .then(response => setData(response.data))
            .catch(error => setFailed(error?.response?.status === 404 ? "missing" : "failed"));
    }, [processId]);

    const taskRows = useMemo(() => data ? taskComparisonRows(data) : [], [data]);

    const chart = useMemo(() => {
        if (!data) return null;
        const {asIs, toBe} = data.comparison;
        const before = task ? asIs.tasks[task]?.queue ?? [] : asIs.queue;
        const after = task ? toBe.tasks[task]?.queue ?? [] : toBe.queue;
        const max = Math.max(1, ...before, ...after);
        return {
            max,
            before: line(before, max),
            after: `0,${CHART_HEIGHT} ${line(after, max)} ${CHART_WIDTH},${CHART_HEIGHT}`,
        };
    }, [data, task]);

    if (failed) {
        return <div className="mx-auto mt-16 max-w-xl rounded-2xl border-2 border-slate-300 bg-slate-100 p-8 text-center">
            <h2 className="mb-2 text-xl font-semibold">
                {failed === "missing" ? "Comparison not found or expired" : "The comparison could not be loaded"}
            </h2>
            <p className="mb-6 text-sm text-slate-600">
                {failed === "missing"
                    ? "This link does not point to a what-if run. Simulations are deleted after 30 days without being opened."
                    : "Something went wrong while loading this comparison. Please reload the page in a moment."}
            </p>
            <Link href="/" className="rounded-2xl border-2 border-emerald-800 bg-emerald-600 px-6 py-2 font-bold text-green-50">
                Start a new simulation
            </Link>
        </div>;
    }

    if (!data || !chart) return <p className="p-16 text-center text-sm text-slate-400">Loading the comparison…</p>;

    const {asIs, toBe, poolsAsIs, poolsToBe, repeats} = data.comparison;
    const {changes, seeds} = repeats;
    const metrics = [
        {
            name: "Average waiting",
            before: hours(asIs.waitMs),
            after: hours(toBe.waitMs),
            change: signedHours(asIs.waitMs !== null && toBe.waitMs !== null ? toBe.waitMs - asIs.waitMs : null),
            spread: range(changes.waitMs, signedHours),
            verdict: verdictOf(changes.waitMs, seeds),
        },
        {
            name: "Cases waiting on average",
            before: decimal(asIs.queueAverage),
            after: decimal(toBe.queueAverage),
            change: signedDecimal(toBe.queueAverage - asIs.queueAverage),
            spread: range(changes.queueAverage, signedDecimal),
            verdict: verdictOf(changes.queueAverage, seeds),
        },
        {
            name: "Average cycle time",
            before: hours(asIs.cycleMs),
            after: hours(toBe.cycleMs),
            change: signedHours(asIs.cycleMs !== null && toBe.cycleMs !== null ? toBe.cycleMs - asIs.cycleMs : null),
            spread: range(changes.cycleMs, signedHours),
            verdict: verdictOf(changes.cycleMs, seeds),
        },
        {
            name: "Cases finished by the horizon",
            before: String(asIs.finished),
            after: String(toBe.finished),
            change: signedCount(toBe.finished - asIs.finished),
            spread: range(changes.finished, signedCount),
            verdict: verdictOf(changes.finished, seeds, true),
        },
    ];
    const details = [
        {name: "Peak cases waiting", before: asIs.queuePeak, after: toBe.queuePeak},
        {name: "Waiting at the horizon", before: asIs.waitingAtEnd, after: toBe.waitingAtEnd},
        {name: "Open at the horizon", before: asIs.openAtEnd, after: toBe.openAtEnd},
        {name: "New cases", before: asIs.arrived, after: toBe.arrived},
    ];

    return <div className="compare-page">
        <div className="simulation-toolbar">
            <Link href={`/simulation/${data.baseProcessId}`} className="toolbar-btn">← As-is simulation</Link>
            <Link href={`/simulation/${processId}`} className="toolbar-btn">Open to-be</Link>
        </div>

        <header className="compare-header">
            <h2>As-is vs to-be</h2>
            <p>{data.label}</p>
            <p className="stats-unit">
                Both start from the same state. {formatShortDate(new Date(asIs.startDate), data.utcOffset)} to {formatShortDate(new Date(asIs.endDate), data.utcOffset)}.
            </p>
        </header>

        <section className="compare-card">
            <div className="compare-scroll">
                <table className="compare-table">
                    <thead>
                        <tr>
                            <th scope="col"/>
                            <th scope="col">As-is</th>
                            <th scope="col">To-be</th>
                            <th scope="col">Change</th>
                            <th scope="col">Across {seeds} {seeds === 1 ? "seed" : "seeds"}</th>
                            <th scope="col"/>
                        </tr>
                    </thead>
                    <tbody>
                        {metrics.map(metric => <tr key={metric.name}>
                            <th scope="row">{metric.name}</th>
                            <td>{metric.before}</td>
                            <td>{metric.after}</td>
                            <td>{metric.change}</td>
                            <td className="compare-spread">{metric.spread}</td>
                            <td><VerdictChip verdict={metric.verdict}/></td>
                        </tr>)}
                        {details.map(detail => <tr key={detail.name}>
                            <th scope="row">{detail.name}</th>
                            <td>{detail.before}</td>
                            <td>{detail.after}</td>
                            <td>{signedCount(detail.after - detail.before)}</td>
                            <td/>
                            <td/>
                        </tr>)}
                    </tbody>
                </table>
            </div>
            <p className="stats-unit compare-note">
                A single run depends on chance, so both sides were repeated with the same {seeds} random {seeds === 1 ? "seed" : "seeds"}.
                {seeds >= MIN_SEEDS_FOR_VERDICT
                    ? " A change is clear when every seed moved the same way."
                    : " That is too few to tell a real change from chance: this model takes long to simulate."}
                {" "}Waiting and cycle time include work that only finishes after the horizon.
            </p>
        </section>

        <section className="compare-card task-panel-chart">
            <div className="task-panel-subtitle">
                Cases waiting over the simulation <span className="stats-unit">{task || "all tasks"}</span>
            </div>
            <svg className="compare-chart" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img"
                 aria-label={`Cases waiting over the simulation, as-is and to-be, at most ${chart.max}`}>
                <polygon points={chart.after} className="queue-area"/>
                <polyline points={chart.before} className="as-is-line"/>
            </svg>
            <div className="task-panel-axis">
                <span>{formatShortDate(new Date(asIs.startDate), data.utcOffset)}</span>
                <span><i className="legend-swatch swatch-as-is"/> as-is <i className="legend-swatch swatch-waiting"/> to-be · max {chart.max}</span>
                <span>{formatShortDate(new Date(asIs.endDate), data.utcOffset)}</span>
            </div>
        </section>

        <section className="compare-card">
            <div className="task-panel-subtitle">By task <span className="stats-unit">(pick one to see it above)</span></div>
            <div className="compare-scroll">
                <table className="compare-table">
                    <thead>
                        <tr>
                            <th scope="col">Task</th>
                            <th scope="col">Waiting as-is</th>
                            <th scope="col">Waiting to-be</th>
                            <th scope="col">Queue as-is</th>
                            <th scope="col">Queue to-be</th>
                            <th scope="col">Peak as-is</th>
                            <th scope="col">Peak to-be</th>
                            <th scope="col"/>
                        </tr>
                    </thead>
                    <tbody>
                        {taskRows.map(row => <tr key={row.name} className={row.name === task ? "selected" : undefined}>
                            <th scope="row">
                                <button type="button" aria-pressed={row.name === task}
                                        onClick={() => setTask(row.name === task ? ALL_TASKS : row.name)}>{row.name}</button>
                            </th>
                            <td>{hours(row.waitAsIs)}</td>
                            <td>{hours(row.waitToBe)}</td>
                            <td>{decimal(row.queueAsIs)}</td>
                            <td>{decimal(row.queueToBe)}</td>
                            <td>{row.peakAsIs}</td>
                            <td>{row.peakToBe}</td>
                            <td><VerdictChip verdict={row.verdict}/></td>
                        </tr>)}
                    </tbody>
                </table>
            </div>
        </section>

        <section className="compare-card">
            <div className="task-panel-subtitle">Resource pools <span className="stats-unit">(share of working time spent busy)</span></div>
            <div className="compare-scroll">
                <table className="compare-table">
                    <thead>
                        <tr>
                            <th scope="col">Pool</th>
                            <th scope="col">Resources as-is</th>
                            <th scope="col">Resources to-be</th>
                            <th scope="col">Busy as-is</th>
                            <th scope="col">Busy to-be</th>
                        </tr>
                    </thead>
                    <tbody>
                        {poolsToBe.map(pool => {
                            const before = poolsAsIs.find(({id: poolId}) => poolId === pool.id);
                            return <tr key={pool.id}>
                                <th scope="row">{pool.name}</th>
                                <td>{before?.size ?? "–"}</td>
                                <td>{pool.size}</td>
                                <td>{share(before?.utilization ?? null)}</td>
                                <td>{share(pool.utilization)}</td>
                            </tr>;
                        })}
                    </tbody>
                </table>
            </div>
        </section>
    </div>;
};

export default Compare;
