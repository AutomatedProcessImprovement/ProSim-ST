import {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {ResourcePool, ResourceTimeline} from "@definitions/api/types";
import {formatShortDate} from "@utils/dateHelpers";
import {sampleIndexAt} from "@utils/processAnalysis";

type Props = {
    processId: string;
    utcOffset: string;
    getCurrentTime: () => number | null;
    onClose: () => void;
};

const CHART_WIDTH = 300;
const CHART_HEIGHT = 56;
const COLUMNS = 60;

const percent = (share: number | null) => share === null ? "no working time" : `${Math.round(share * 100)}%`;

export const toColumns = (pool: Pick<ResourcePool, "busy" | "idle">, count = COLUMNS) => {
    const width = Math.max(1, Math.ceil(pool.busy.length / count));
    const columns: Array<{busy: number; idle: number}> = [];
    for (let start = 0; start < pool.busy.length; start += width) {
        const working = pool.busy.slice(start, start + width)
            .map((busy, offset) => ({busy, idle: pool.idle[start + offset]}))
            .filter(({busy, idle}) => busy + idle > 0);
        const average = (values: number[]) => working.length ? values.reduce((sum, value) => sum + value, 0) / working.length : 0;
        columns.push({busy: average(working.map(({busy}) => busy)), idle: average(working.map(({idle}) => idle))});
    }
    return columns;
};

const PoolChart = ({pool}: {pool: ResourcePool}) => {
    const columns = useMemo(() => toColumns(pool), [pool]);
    const width = CHART_WIDTH / Math.max(columns.length, 1);
    const scale = CHART_HEIGHT / Math.max(pool.size, 1);

    return <>
        {columns.map(({busy, idle}, index) => <g key={index}>
            <rect x={index * width} width={width} y={CHART_HEIGHT - (busy + idle) * scale} height={idle * scale} className="idle-area"/>
            <rect x={index * width} width={width} y={CHART_HEIGHT - busy * scale} height={busy * scale} className="busy-area"/>
        </g>)}
    </>;
};

const Pool = ({pool, index, calendarsKnown, markerX}: {
    pool: ResourcePool;
    index: number;
    calendarsKnown: boolean;
    markerX: number | null;
}) => {
    const [open, setOpen] = useState(false);
    const busy = pool.busy[index] ?? 0;
    const idle = pool.idle[index] ?? 0;
    const off = pool.size - busy - idle;

    return <li className="resource-pool">
        <button type="button" className="resource-pool-head" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span className="resource-pool-name">{pool.name} <span className="stats-unit">({pool.size})</span></span>
            <span className="stats-unit">{percent(pool.utilization)} busy</span>
        </button>
        <div className="task-panel-counts">
            <span className="count-chip count-working">{busy} busy</span>
            <span className="count-chip count-idle">{idle} idle</span>
            {calendarsKnown && off > 0 && <span className="count-chip count-off">{off} off shift</span>}
        </div>
        <div className="task-panel-chart resource-chart">
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio="none" role="img"
                 aria-label={`${pool.name}: busy and idle resources over the simulation, out of ${pool.size}`}>
                <PoolChart pool={pool}/>
                {markerX !== null && <line x1={markerX} x2={markerX} y1={0} y2={CHART_HEIGHT} className="now-line"/>}
            </svg>
        </div>
        {open && <ul className="resource-list">
            {[...pool.resources]
                .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0))
                .map(resource => <li key={resource.name}>
                    <span className="resource-name">{resource.name}</span>
                    <span className="resource-bar"><i style={{width: `${(resource.utilization ?? 0) * 100}%`}}/></span>
                    <span className="stats-unit">{percent(resource.utilization)}</span>
                </li>)}
        </ul>}
    </li>;
};

const ResourcePanel = ({processId, utcOffset, getCurrentTime, onClose}: Props) => {
    const [timeline, setTimeline] = useState<ResourceTimeline | null>(null);
    const [failed, setFailed] = useState(false);
    const [currentTime, setCurrentTime] = useState<number | null>(() => getCurrentTime());

    useEffect(() => {
        let active = true;
        axios.get<ResourceTimeline>(`/api/simulation/${processId}/resources`)
            .then(({data}) => active && setTimeline(data))
            .catch(() => active && setFailed(true));
        return () => {
            active = false;
        };
    }, [processId]);

    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(getCurrentTime()), 500);
        return () => clearInterval(interval);
    }, [getCurrentTime]);

    const pools = useMemo(
        () => [...(timeline?.pools ?? [])].sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0)),
        [timeline],
    );
    const start = timeline ? Date.parse(timeline.startDate) : 0;
    const end = timeline ? Date.parse(timeline.endDate) : 0;
    const index = timeline && pools.length && currentTime !== null
        ? sampleIndexAt({startDate: timeline.startDate, stepMs: timeline.stepMs, open: pools[0].busy}, currentTime)
        : 0;
    const markerX = timeline && currentTime !== null && end > start
        ? Math.max(0, Math.min(1, (currentTime - start) / (end - start))) * CHART_WIDTH
        : null;

    return <aside className="task-panel" aria-label="Resources">
        <div className="task-panel-header">
            <h3>Resources</h3>
            <button type="button" className="task-panel-close" onClick={onClose} aria-label="Close resources">×</button>
        </div>
        {failed && <p className="task-panel-text">The resources of this simulation could not be loaded.</p>}
        {!failed && !timeline && <p className="task-panel-text">Loading…</p>}
        {timeline && <>
            <p className="task-panel-text">
                Who is busy or idle in each pool right now, and during working hours over the simulation.
                {timeline.calendarsKnown && " The percentage is the share of working time spent busy."}
            </p>
            <div className="task-panel-axis">
                <span>{formatShortDate(new Date(timeline.startDate), utcOffset)}</span>
                <span><i className="legend-swatch swatch-working"/> busy <i className="legend-swatch swatch-idle"/> idle</span>
                <span>{formatShortDate(new Date(timeline.endDate), utcOffset)}</span>
            </div>
            <ul className="resource-pools">
                {pools.map(pool => <Pool key={pool.id} pool={pool} index={index} calendarsKnown={timeline.calendarsKnown} markerX={markerX}/>)}
            </ul>
        </>}
    </aside>;
};

export default ResourcePanel;
