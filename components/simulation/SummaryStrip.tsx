import {ProcessAnalysis} from "@definitions/api/types";
import {TaskLoad, WTPTState} from "@definitions/simulation/types";
import {formatDuration, formatShortDate} from "@utils/dateHelpers";

type Props = {
    numberOfCases: {ongoing: number; finished: number};
    analysis: ProcessAnalysis | null;
    taskLoad: TaskLoad;
    wtpt: WTPTState;
    utcOffset: string;
    onSelectTask: (taskId: string) => void;
};

const MAX_BOTTLENECKS = 3;

// The numbers an analyst quotes: open cases now, the flow so far, where work piles up right now, and what the
// simulation forecasts at its horizon
const SummaryStrip = ({numberOfCases, analysis, taskLoad, wtpt, utcOffset, onSelectTask}: Props) => {
    const bottlenecks = Object.entries(taskLoad)
        .filter(([, load]) => load.waiting > 0)
        .sort(([, a], [, b]) => b.waiting - a.waiting)
        .slice(0, MAX_BOTTLENECKS);
    const arrived = analysis ? Math.max(0, numberOfCases.ongoing + numberOfCases.finished - analysis.openAtStart) : null;

    return <div className="summary-strip" aria-label="Simulation summary">
        <div className="summary-card">
            <div className="summary-label">Open now</div>
            <div className="summary-value">{numberOfCases.ongoing}</div>
            {analysis && <div className="summary-sub">{analysis.openAtStart} at the start</div>}
        </div>
        <div className="summary-card">
            <div className="summary-label">So far</div>
            <div className="summary-value summary-value-small">
                {arrived !== null && <>{arrived} arrived · </>}{numberOfCases.finished} completed
            </div>
        </div>
        <div className="summary-card summary-card-wide">
            <div className="summary-label">Longest queues now</div>
            {bottlenecks.length ? <ol className="bottleneck-list">
                {bottlenecks.map(([taskId, load]) => {
                    const stats = wtpt[taskId];
                    return <li key={taskId}>
                        <button type="button" className="bottleneck-chip" onClick={() => onSelectTask(taskId)}
                                title={`${stats?.name || taskId}: show this task's queue`}>
                            <span className="bottleneck-name">{stats?.name || taskId}</span>
                            <span className="bottleneck-count">{load.waiting} waiting</span>
                            {stats?._count > 0 && <span className="bottleneck-wait">avg wait {formatDuration(stats.averageWT)}</span>}
                        </button>
                    </li>;
                })}
            </ol> : <div className="summary-sub">No case is waiting</div>}
        </div>
        {analysis && <div className="summary-card summary-card-forecast">
            <div className="summary-label">Forecast at {formatShortDate(new Date(analysis.endDate), utcOffset)}</div>
            <div className="summary-value summary-value-small">
                {analysis.openAtEnd} open <span className="summary-trend">(from {analysis.openAtStart})</span>
            </div>
            <div className="summary-sub">
                {analysis.openAtStartFinished} of {analysis.openAtStart} open at the start finished
                · {analysis.arrived} new, {analysis.completed} completed
            </div>
        </div>}
    </div>;
};

export default SummaryStrip;
