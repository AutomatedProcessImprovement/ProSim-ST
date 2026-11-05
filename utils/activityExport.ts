import {LifecycleTypes} from "@definitions/simulation/enums";
import {ProcessAnalysis} from "@definitions/api/types";
import {WTPTState} from "@definitions/simulation/types";
import {formatInLogTime} from "@utils/dateHelpers";
import {toCsv} from "@utils/csv";
import {AnalysisEvent, toUtcMs} from "@utils/processAnalysis";

const HOUR = 3600000;

type ActivityInstance = {
    caseId: number;
    nodeId: string;
    enable?: number;
    start?: number;
    end?: number;
};

const stamp = (moment: number | undefined, utcOffset: string) =>
    moment === undefined ? null : `${formatInLogTime(new Date(moment), utcOffset).replace(" ", "T")}${utcOffset}`;

const hours = (ms: number) => Number((ms / HOUR).toFixed(4));

const pairInstances = (events: AnalysisEvent[]): ActivityInstance[] => {
    const instances: ActivityInstance[] = [];
    const open = new Map<string, ActivityInstance[]>();

    const addInstance = (key: string, instance: ActivityInstance) => {
        instances.push(instance);
        open.set(key, [...(open.get(key) ?? []), instance]);
        return instance;
    };

    events.forEach(({caseId, nodeId, lifecycle, timestamp}) => {
        if (!nodeId) return;
        const key = `${caseId}|${nodeId}`;
        const moment = toUtcMs(timestamp);
        const running = open.get(key) ?? [];

        if (lifecycle === LifecycleTypes.ENABLE) {
            addInstance(key, {caseId, nodeId, enable: moment});
        } else if (lifecycle === LifecycleTypes.START) {
            const instance = running.find(candidate => candidate.start === undefined) ?? addInstance(key, {caseId, nodeId});
            instance.start = moment;
        } else if (lifecycle === LifecycleTypes.COMPLETE) {
            const instance = running[0] ?? addInstance(key, {caseId, nodeId});
            instance.end = moment;
            open.set(key, open.get(key).filter(candidate => candidate !== instance));
        }
    });

    return instances;
};

export const buildLogCsv = (events: AnalysisEvent[], taskNames: Record<string, string>, utcOffset: string) => {
    const firstMoment = ({enable, start, end}: ActivityInstance) => enable ?? start ?? end ?? 0;
    const rows = pairInstances(events)
        .sort((a, b) => firstMoment(a) - firstMoment(b))
        .map(({caseId, nodeId, enable, start, end}) => [
            caseId,
            taskNames[nodeId] || nodeId,
            stamp(enable, utcOffset),
            stamp(start, utcOffset),
            stamp(end, utcOffset),
        ]);
    return toCsv(["case_id", "activity", "enable_time", "start_time", "end_time"], rows);
};

export const buildActivitiesCsv = (wtpt: WTPTState, series: ProcessAnalysis["tasks"], taskNames: Record<string, string>) => {
    const taskIds = [...new Set([...Object.keys(taskNames), ...Object.keys(wtpt), ...Object.keys(series)])];
    const rows = taskIds
        .map(taskId => ({taskId, name: taskNames[taskId] || taskId}))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({taskId, name}) => {
            const stats = wtpt[taskId];
            const completed = stats?._count ?? 0;
            const queue = series[taskId];
            return [
                name,
                completed,
                completed ? hours(stats.averageWT) : null,
                completed ? hours(stats.averagePT) : null,
                queue?.waiting.length ? Math.max(...queue.waiting) : 0,
                queue?.inWork.length ? Math.max(...queue.inWork) : 0,
            ];
        });
    return toCsv(
        ["activity", "completed", "average_waiting_hours", "average_processing_hours", "peak_waiting", "peak_in_work"],
        rows,
    );
};
