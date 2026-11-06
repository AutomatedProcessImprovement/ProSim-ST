import {useEffect, useMemo, useState} from "react";
import axios from "axios";
import {ProcessAnalysis, RunDetails, ScenarioLink} from "@definitions/api/types";
import {formatLogMoment, formatUtcOffset} from "@utils/dateHelpers";

type Props = {
    processId: string;
    scenario?: ScenarioLink | null;
    startDate: string;
    endDate: string;
    utcOffset: string;
    openAtStart: number;
    analysis: ProcessAnalysis | null;
    taskName: (taskId: string) => string;
    onShowTask: (taskId: string) => void;
    onClose: () => void;
};

const seconds = (value: number) => value < 60 ? `${value.toFixed(1)} s` : `${Math.floor(value / 60)} min ${Math.round(value % 60)} s`;

const RunPanel = ({processId, scenario, startDate, endDate, utcOffset, openAtStart, analysis, taskName, onShowTask, onClose}: Props) => {
    const [details, setDetails] = useState<RunDetails | null>(null);

    useEffect(() => {
        let cancelled = false;
        axios.get<RunDetails>(`/api/simulation/${processId}/run`)
            .then(({data}) => { if (!cancelled) setDetails(data); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [processId]);

    const rows = useMemo(() => Object.entries(analysis?.startTasks ?? {})
        .map(([taskId, counts]) => ({taskId, ...counts}))
        .sort((a, b) => b.waiting + b.inWork - a.waiting - a.inWork), [analysis]);

    const facts: Array<[string, string | number | undefined | null]> = [
        ["Changes", scenario?.label],
        ["Event log", details?.files?.log],
        ["Model", details?.files?.bpmn],
        ["Parameters", details?.files?.parameters],
        ["Starting point", formatLogMoment(new Date(startDate + "Z"), utcOffset)],
        ["Simulated until", formatLogMoment(new Date(endDate + "Z"), utcOffset)],
        ["Time zone", formatUtcOffset(utcOffset)],
        ["Random seed", details?.seed],
        ["New cases", analysis?.arrived],
        ["Finished", analysis?.completed],
        ["Open at the end", analysis?.openAtEnd],
    ];

    const stateNote = !scenario && details?.stateSeconds
        ? `State computed in ${seconds(details.stateSeconds)}, simulated in ${seconds(details.simulationSeconds ?? 0)}.`
        : scenario && !scenario.edits.emptyStart && details?.stateSeconds
            ? `State reused from the as-is run, where it took ${seconds(details.stateSeconds)}.`
            : null;

    return <aside className="task-panel" aria-label="This run">
        <div className="task-panel-header">
            <h3>This run</h3>
            <button type="button" className="task-panel-close" onClick={onClose} aria-label="Close run details">×</button>
        </div>

        <div className="task-panel-subtitle">Starting state</div>
        <p className="task-panel-text">
            {scenario?.edits.emptyStart
                ? "This run starts with no case in progress."
                : openAtStart === 0
                    ? "No case was in progress at the start."
                    : `${openAtStart} ${openAtStart === 1 ? "case was" : "cases were"} in progress at the start.`}
            {stateNote && <> <span className="stats-unit">{stateNote}</span></>}
        </p>
        {rows.length > 0 && <ul className="run-tasks">
            {rows.map(row => <li key={row.taskId}>
                <button type="button" onClick={() => onShowTask(row.taskId)}>{taskName(row.taskId)}</button>
                <span className="stats-unit">{[
                    row.waiting ? `${row.waiting} waiting` : null,
                    row.inWork ? `${row.inWork} in work` : null,
                ].filter(Boolean).join(" · ")}</span>
            </li>)}
        </ul>}

        <div className="task-panel-subtitle">Inputs and results</div>
        <dl className="run-facts">
            {facts.filter(([, value]) => value !== undefined && value !== null && value !== "").map(([label, value]) =>
                <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                </div>)}
        </dl>
    </aside>;
};

export default RunPanel;
