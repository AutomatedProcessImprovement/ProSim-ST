import {useEffect, useMemo, useRef, useState} from "react";
import {createPortal} from "react-dom";
import Link from "next/link";
import {useRouter} from "next/navigation";
import axios from "axios";
import {toast} from "sonner";
import {ScenarioEdits, WhatIfOptions} from "@definitions/api/types";
import RunProgress, {STAGE_LABELS} from "@components/simulationSetup/RunProgress";
import {pollRun} from "@utils/pollRun";
import {JobStatus, SCENARIO_STAGES} from "@utils/simulationJobs";
import {changedEdits, formatPercent, hasEdits, MAX_PERCENT, MAX_POOL_SIZE, MIN_PERCENT, NO_EDITS} from "@utils/scenario";

type Props = {
    processId: string;
    initialEdits?: ScenarioEdits;
    onClose: () => void;
};

const PERCENT_STEP = 10;
const STAGE_NAMES = {state: "Loading the saved process state"};

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const Stepper = ({label, note, shown, changed, onChange}: {
    label: string;
    note?: string;
    shown: string;
    changed: boolean;
    onChange: (direction: 1 | -1) => void;
}) => (
    <div className={changed ? "stepper changed" : "stepper"}>
        <button type="button" onClick={() => onChange(-1)} aria-label={`Less ${label}`}>−</button>
        <output aria-label={label}>{shown}</output>
        <button type="button" onClick={() => onChange(1)} aria-label={`More ${label}`}>+</button>
        {note && <span className="stats-unit stepper-was">{note}</span>}
    </div>
);

const WhatIfPanel = ({processId, initialEdits = NO_EDITS, onClose}: Props) => {
    const router = useRouter();
    const [options, setOptions] = useState<WhatIfOptions | null>(null);
    const [failed, setFailed] = useState(false);
    const [edits, setEdits] = useState<ScenarioEdits>({...initialEdits, emptyStart: false});
    const [running, setRunning] = useState(false);
    const [status, setStatus] = useState<JobStatus | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        axios.get<WhatIfOptions>(`/api/simulation/${processId}/what-if`)
            .then(({data}) => mountedRef.current && setOptions(data))
            .catch(() => mountedRef.current && setFailed(true));
        return () => {
            mountedRef.current = false;
        };
    }, [processId]);

    const changed = useMemo(() => options ? changedEdits(edits, options) : NO_EDITS, [edits, options]);
    const changedTasks = Object.keys(changed.tasks).length;

    const setPool = (id: string, size: number) => setEdits(current => ({
        ...current,
        pools: {...current.pools, [id]: clamp(size, 1, MAX_POOL_SIZE)},
    }));
    const stepPercent = (percent: number, direction: 1 | -1) =>
        clamp(percent + direction * PERCENT_STEP, MIN_PERCENT, MAX_PERCENT);

    const run = async (requested: ScenarioEdits) => {
        setRunning(true);
        setStatus({stage: "queued", durations: {}});
        try {
            const {data} = await axios.post<{id: string; existing?: boolean}>(`/api/simulation/${processId}/what-if`, requested);
            const result = data.existing ? {stage: "done"} : await pollRun(data.id, setStatus, () => mountedRef.current);
            if (!result) return;
            if (result.stage === "done") {
                router.push(`/simulation/${data.id}/compare`);
                return;
            }
            const failedStage = (result as JobStatus).error?.stage ?? "simulation";
            toast.error(`The what-if run failed: ${STAGE_LABELS[failedStage].toLowerCase()}`, {
                description: (result as JobStatus).error?.message,
                duration: 15000,
            });
        } catch (error) {
            toast.error("The what-if run could not start", {description: error?.response?.data?.error});
        }
        setRunning(false);
        setStatus(null);
    };

    return <aside className="task-panel" aria-label="What-if">
        <div className="task-panel-header">
            <h3>What-if</h3>
            <button type="button" className="task-panel-close" onClick={onClose} aria-label="Close what-if">×</button>
        </div>
        {failed && <p className="task-panel-text">The what-if options could not be loaded.</p>}
        {!failed && !options && <p className="task-panel-text">Loading…</p>}
        {options && !options.supported && <p className="task-panel-text">
            This simulation was created before what-if runs existed. Run it again to use them.
        </p>}
        {options?.supported && <>
            <p className="task-panel-text">Rerun from the same starting state with these changes, then compare.</p>

            <div className="task-panel-subtitle">Resources per pool</div>
            {!options.editablePools && <p className="task-panel-text">Pool sizes cannot be changed for fuzzy calendars.</p>}
            {options.editablePools && <ul className="whatif-list">
                {options.pools.map(pool => {
                    const size = edits.pools[pool.id] ?? pool.size;
                    return <li key={pool.id}>
                        <span className="whatif-name">{pool.name}</span>
                        <Stepper label={`${pool.name} resources`} shown={String(size)} changed={size !== pool.size}
                                 note={size !== pool.size ? `was ${pool.size}` : undefined}
                                 onChange={direction => setPool(pool.id, size + direction)}/>
                    </li>;
                })}
            </ul>}

            <div className="task-panel-subtitle">Arriving cases</div>
            <ul className="whatif-list">
                <li>
                    <span className="whatif-name">New cases</span>
                    <Stepper label="new cases" shown={formatPercent(edits.arrivalPercent)} changed={edits.arrivalPercent !== 0}
                             onChange={direction => setEdits(current => ({
                                 ...current,
                                 arrivalPercent: stepPercent(current.arrivalPercent, direction),
                             }))}/>
                </li>
            </ul>

            <details className="whatif-tasks" open={changedTasks > 0 || undefined}>
                <summary className="task-panel-subtitle">
                    Task durations {changedTasks > 0 && <span className="stats-unit">({changedTasks} changed)</span>}
                </summary>
                <ul className="whatif-list">
                    {options.tasks.map(task => {
                        const percent = edits.tasks[task.id] ?? 0;
                        return <li key={task.id}>
                            <span className="whatif-name" title={task.name}>{task.name}</span>
                            <Stepper label={`${task.name} duration`} shown={formatPercent(percent)} changed={percent !== 0}
                                     onChange={direction => setEdits(current => ({
                                         ...current,
                                         tasks: {...current.tasks, [task.id]: stepPercent(percent, direction)},
                                     }))}/>
                        </li>;
                    })}
                </ul>
            </details>

            <div className="whatif-actions">
                <button type="button" className="toolbar-btn whatif-run" disabled={!hasEdits(changed) || running} onClick={() => run(changed)}>
                    Run what-if
                </button>
                <button type="button" className="toolbar-btn" disabled={!hasEdits(changed)} onClick={() => setEdits(NO_EDITS)}>
                    Reset
                </button>
            </div>

            <div className="task-panel-subtitle">Starting state</div>
            <p className="task-panel-text">Run the same model with no case in progress, to see what the current state changes.</p>
            <div className="whatif-actions">
                <button type="button" className="toolbar-btn" disabled={running} onClick={() => run({...NO_EDITS, emptyStart: true})}>
                    Compare with an empty start
                </button>
            </div>

            {options.scenarios.length > 0 && <>
                <div className="task-panel-subtitle">Earlier what-ifs</div>
                <ul className="whatif-earlier">
                    {options.scenarios.map(scenario => <li key={scenario.id}>
                        <Link href={`/simulation/${scenario.id}/compare`}>{scenario.label}</Link>
                    </li>)}
                </ul>
            </>}
        </>}
        {running && createPortal(
            <RunProgress status={status} stages={SCENARIO_STAGES} title="Running the what-if" labels={STAGE_NAMES}/>,
            document.body,
        )}
    </aside>;
};

export default WhatIfPanel;
