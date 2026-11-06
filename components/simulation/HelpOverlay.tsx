import {STATE_COLORS} from "@modules/simulation/restLayout";

const Dot = ({color}: {color: string}) => <i className="legend-dot" style={{background: color}}/>;

const HelpOverlay = ({onClose}: {onClose: () => void}) => (
    <aside className="task-panel help-overlay" aria-label="How to read this">
        <div className="task-panel-header">
            <h3>How to read this</h3>
            <button type="button" className="task-panel-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <p className="task-panel-text">Each dot is a case moving through the process.</p>
        <ul className="help-list">
            <li><Dot color={STATE_COLORS.waiting}/> Waiting for a task</li>
            <li><Dot color={STATE_COLORS.working}/> In work at a task</li>
            <li><Dot color={STATE_COLORS.moving}/> Moving between tasks</li>
            <li><Dot color={STATE_COLORS.sync}/> Waiting for parallel branches</li>
            <li><i className="legend-shade"/> Orange task: the longer the queue, the darker it gets</li>
            <li><span className="help-count">12 waiting</span> Count shown when there are more cases than dots</li>
        </ul>
        <p className="task-panel-text">
            Click a task to see its queue. Click a dot to follow that case. The curve above the timeline is the number of cases in progress, and its marks show the longest queues.
        </p>
        <p className="task-panel-text">
            This run shows the starting state and the inputs. Resources shows who is busy, idle or off shift. What-if reruns from the same starting state with your changes and compares the results.
        </p>
        <button type="button" className="toolbar-btn" onClick={onClose}>Got it</button>
    </aside>
);

export default HelpOverlay;
