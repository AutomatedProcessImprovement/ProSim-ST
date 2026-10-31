import {clsx} from "clsx/lite";
import {CheckCircleIcon} from "@heroicons/react/24/solid";
import {JobStatus, SIMULATION_STAGES, SimulationStage} from "@utils/simulationJobs";

export const STAGE_LABELS: Record<SimulationStage, string> = {
    queued: "Waiting for the simulator",
    state: "Computing the process state",
    simulation: "Simulating the horizon",
    playback: "Preparing the playback",
    saving: "Saving the results",
};

const formatSeconds = (seconds?: number) => {
    if (seconds === undefined) return "";
    if (seconds < 60) return `${seconds.toFixed(1)} s`;
    return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
};

const RunProgress = ({status}: {status: JobStatus | null}) => {
    const current = status && status.stage !== "done" && status.stage !== "failed"
        ? SIMULATION_STAGES.indexOf(status.stage)
        : status?.stage === "done" ? SIMULATION_STAGES.length : 0;
    const total = Object.values(status?.durations ?? {}).reduce((sum, seconds) => sum + seconds, 0);

    return <div className='fixed inset-0 z-50 grid place-items-center bg-slate-950/60' role='dialog' aria-modal='true' aria-labelledby='run-progress-title'>
        <div className='w-full max-w-sm rounded-2xl border border-slate-300 bg-white p-6 shadow-xl'>
            <h2 id='run-progress-title' className='font-semibold'>Running the simulation</h2>
            <p className='mb-4 text-sm text-slate-500'>
                {total > 0 ? `${formatSeconds(total)} so far. ` : ""}Large logs can take a few minutes.
            </p>
            <ol className='flex flex-col gap-2' aria-live='polite'>
                {SIMULATION_STAGES.map((stage, index) => {
                    const done = index < current;
                    const active = index === current;
                    return <li key={stage} className={clsx('flex items-center gap-3 text-sm', !done && !active && 'text-slate-400')}>
                        {done && <CheckCircleIcon className='size-5 shrink-0 text-green-600' aria-hidden='true'/>}
                        {active && <span className='size-5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700' aria-hidden='true'/>}
                        {!done && !active && <span className='size-5 shrink-0 rounded-full border-2 border-slate-200' aria-hidden='true'/>}
                        <span className={clsx('flex-1', active && 'font-medium')}>{STAGE_LABELS[stage]}</span>
                        <span className='tabular-nums text-slate-500'>{(done || active) && formatSeconds(status?.durations[stage])}</span>
                    </li>;
                })}
            </ol>
        </div>
    </div>;
};

export default RunProgress;
