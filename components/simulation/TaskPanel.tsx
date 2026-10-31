import {useEffect, useMemo, useState} from "react";
import {ProcessAnalysis} from "@definitions/api/types";
import {ActivityStats, QueueEntry} from "@definitions/simulation/types";
import {formatDuration, formatShortDate} from "@utils/dateHelpers";

type Props = {
    taskId: string;
    name: string;
    stats?: ActivityStats;
    analysis: ProcessAnalysis | null;
    utcOffset: string;
    getQueue: () => QueueEntry[];
    getCurrentTime: () => number | null;
    onClose: () => void;
};

const CHART_WIDTH = 300;
const CHART_HEIGHT = 80;
const MAX_LISTED_CASES = 50;

const toPoints = (values: number[], max: number) => values
    .map((value, index) => {
        const x = values.length > 1 ? index / (values.length - 1) * CHART_WIDTH : 0;
        return `${x.toFixed(1)},${(CHART_HEIGHT - value / max * CHART_HEIGHT).toFixed(1)}`;
    })
    .join(" ");

const TaskPanel = ({taskId, name, stats, analysis, utcOffset, getQueue, getCurrentTime, onClose}: Props) => {
    const [queue, setQueue] = useState<QueueEntry[]>(() => getQueue());
    const [currentTime, setCurrentTime] = useState<number | null>(() => getCurrentTime());

    useEffect(() => {
        setQueue(getQueue());
        setCurrentTime(getCurrentTime());
        const interval = setInterval(() => {
            setQueue(getQueue());
            setCurrentTime(getCurrentTime());
        }, 500);
        return () => clearInterval(interval);
    }, [taskId, getQueue, getCurrentTime]);

    useEffect(() => {
        const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [onClose]);

    const series = analysis?.tasks[taskId];
    const chart = useMemo(() => {
        if (!series || !series.waiting.length) return null;
        const max = Math.max(1, ...series.waiting, ...series.inWork);
        return {
            max,
            waiting: `0,${CHART_HEIGHT} ${toPoints(series.waiting, max)} ${CHART_WIDTH},${CHART_HEIGHT}`,
            inWork: toPoints(series.inWork, max),
            peak: Math.max(...series.waiting),
        };
    }, [series]);

    const waiting = queue.filter(entry => entry.state === "waiting");
    const inWork = queue.filter(entry => entry.state === "working");
    const now = currentTime ?? 0;
    const markerX = analysis && currentTime !== null
        ? Math.max(0, Math.min(1, (currentTime - Date.parse(analysis.startDate)) / (Date.parse(analysis.endDate) - Date.parse(analysis.startDate)))) * CHART_WIDTH
        : null;

    const describe = (entry: QueueEntry) => {
        const here = entry.since !== null ? formatDuration(now - entry.since) : null;
        const open = entry.arrival !== null && analysis && entry.arrival <= Date.parse(analysis.startDate)
            ? "open since before the start"
            : entry.arrival !== null ? `open ${formatDuration(now - entry.arrival)}` : null;
        return [entry.state === "waiting" ? (here ? `waiting ${here}` : "waiting") : (here ? `in work ${here}` : "in work"), open]
            .filter(Boolean).join(" · ");
    };

    return <aside className="task-panel" aria-label={`Task ${name}`}>
        <div className="task-panel-header">
            <h3>{name}</h3>
            <button type="button" className="task-panel-close" onClick={onClose} aria-label="Close task details">×</button>
        </div>

        <div className="task-panel-counts">
            <span className="count-chip count-waiting">{waiting.length} waiting</span>
            <span className="count-chip count-working">{inWork.length} in work</span>
        </div>

        <p className="task-panel-text">
            {stats?._count
                ? <>Average so far: waiting {formatDuration(stats.averageWT)}, processing {formatDuration(stats.averagePT)} <span className="stats-unit">({stats._count} cases)</span></>
                : "No case has finished this task yet."}
        </p>

        {chart && analysis && <div className="task-panel-chart">
            <div className="task-panel-subtitle">
                Queue over the simulation <span className="stats-unit">(peak {chart.peak} waiting)</span>
            </div>
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img"
                 aria-label={`Cases waiting for ${name} over the simulation, at most ${chart.peak}`}>
                <polygon points={chart.waiting} className="queue-area"/>
                <polyline points={chart.inWork} className="work-line"/>
                {markerX !== null && <line x1={markerX} x2={markerX} y1={0} y2={CHART_HEIGHT} className="now-line"/>}
            </svg>
            <div className="task-panel-axis">
                <span>{formatShortDate(new Date(analysis.startDate), utcOffset)}</span>
                <span><i className="legend-swatch swatch-waiting"/> waiting <i className="legend-swatch swatch-working"/> in work · max {chart.max}</span>
                <span>{formatShortDate(new Date(analysis.endDate), utcOffset)}</span>
            </div>
        </div>}

        <div className="task-panel-subtitle">Cases here {queue.length > 0 && <span className="stats-unit">(longest waiting first)</span>}</div>
        {queue.length ? <ul className="task-panel-cases">
            {queue.slice(0, MAX_LISTED_CASES).map(entry => (
                <li key={`${entry.caseId}-${entry.state}`}>
                    <i className={`legend-swatch ${entry.state === "waiting" ? "swatch-waiting" : "swatch-working"}`}/>
                    <span className="case-id">Case {entry.caseId}</span>
                    <span className="case-detail">{describe(entry)}</span>
                </li>
            ))}
            {queue.length > MAX_LISTED_CASES && <li className="case-more">and {queue.length - MAX_LISTED_CASES} more</li>}
        </ul> : <p className="task-panel-text">No case is at this task right now.</p>}
    </aside>;
};

export default TaskPanel;
