import {ProcessAnalysis} from "@definitions/api/types";
import {TaskLoad, WTPTState} from "@definitions/simulation/types";
import {formatDuration} from "@utils/dateHelpers";

type Props = {
    numberOfCases: {ongoing: number; finished: number};
    analysis: ProcessAnalysis | null;
    taskLoad: TaskLoad;
    wtpt: WTPTState;
    onSelectTask: (taskId: string) => void;
};

const MAX_BOTTLENECKS = 3;

// The numbers an analyst quotes: open cases now, the flow so far, and where work piles up right now
const SummaryStrip = ({numberOfCases, analysis, taskLoad, wtpt, onSelectTask}: Props) => {
    const bottlenecks = Object.entries(taskLoad)
        .filter(([, load]) => load.waiting > 0)
        .sort(([, a], [, b]) => b.waiting - a.waiting)
        .slice(0, MAX_BOTTLENECKS);
    const arrived = analysis ? Math.max(0, numberOfCases.ongoing + numberOfCases.finished - analysis.openAtStart) : null;

    return <div className="summary-strip" aria-label="Simulation summary">
        <section className="summary-item">
            <h3>Open now</h3>
            <p>{numberOfCases.ongoing} {analysis && <span className="summary-muted">({analysis.openAtStart} at the start)</span>}</p>
        </section>
        <section className="summary-item">
            <h3>So far</h3>
            <p>{arrived !== null && <><i>Arrived:</i> {arrived} · </>}<i>Completed:</i> {numberOfCases.finished}</p>
        </section>
        <section className="summary-item summary-queues">
            <h3>Longest queues now</h3>
            {bottlenecks.length ? <ol className="queue-list">
                {bottlenecks.map(([taskId, load]) => {
                    const stats = wtpt[taskId];
                    const name = stats?.name || taskId;
                    return <li key={taskId}>
                        <button type="button" className="queue-link" onClick={() => onSelectTask(taskId)}
                                title={stats?._count > 0
                                    ? `${name}: average wait ${formatDuration(stats.averageWT)}. Click for its queue.`
                                    : `${name}: click for its queue`}>
                            <span className="queue-count">{load.waiting} waiting</span>
                            <span className="queue-name">{name}</span>
                        </button>
                    </li>;
                })}
            </ol> : <p className="summary-muted">No case is waiting</p>}
        </section>
    </div>;
};

export default SummaryStrip;
