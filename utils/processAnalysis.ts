import {LifecycleTypes} from "@definitions/simulation/enums";
import {ProcessAnalysis} from "@definitions/api/types";

const HOUR = 3600000;
const MAX_SAMPLES = 1500;

export type AnalysisEvent = {
    caseId: number;
    lifecycle: LifecycleTypes | string;
    nodeId: string | null;
    timestamp: string;
};

export const toUtcMs = (timestamp: string): number => {
    const value = timestamp.trim().replace(" ", "T");
    return Date.parse(/(Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value + "Z");
};

export const readFlowTargets = (bpmnXml: string): Record<string, string> => {
    const targets: Record<string, string> = {};
    for (const [tag] of bpmnXml.matchAll(/<(?:\w+:)?sequenceFlow\b[^>]*>/g)) {
        const id = tag.match(/\sid="([^"]+)"/)?.[1];
        const target = tag.match(/\stargetRef="([^"]+)"/)?.[1];
        if (id && target) targets[id] = target;
    }
    return targets;
};

const unescapeXml = (text: string) => text
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

export const readTaskNames = (bpmnXml: string): Record<string, string> => {
    const names: Record<string, string> = {};
    for (const [tag] of bpmnXml.matchAll(/<(?:\w+:)?\w*[tT]ask\b[^>]*>/g)) {
        const id = tag.match(/\sid="([^"]+)"/)?.[1];
        const name = tag.match(/\sname="([^"]*)"/)?.[1];
        if (id) names[id] = unescapeXml(name ?? "").trim();
    }
    return names;
};

type TaskState = "waiting" | "inWork";

export const buildProcessAnalysis = (
    events: AnalysisEvent[],
    frames: Array<{caseId: number; activeElements: Record<string, string>; arrivalTime?: string | null}>,
    flowTargets: Record<string, string>,
    processStart: string,
    processEnd: string,
): ProcessAnalysis => {
    const startMs = toUtcMs(processStart);
    const endMs = toUtcMs(processEnd);
    const total = Math.max(endMs - startMs, 0);
    const stepMs = Math.max(HOUR, Math.ceil(total / MAX_SAMPLES));
    const sampleCount = Math.floor(total / stepMs) + 1;

    const taskIds = new Set<string>();
    events.forEach(event => {
        if (event.nodeId && (event.lifecycle === LifecycleTypes.ENABLE || event.lifecycle === LifecycleTypes.START
            || event.lifecycle === LifecycleTypes.COMPLETE)) taskIds.add(event.nodeId);
    });

    const caseTasks = new Map<number, Map<string, TaskState>>();
    const counts: Record<string, {waiting: number; inWork: number}> = {};
    const series: ProcessAnalysis["tasks"] = {};
    taskIds.forEach(taskId => {
        counts[taskId] = {waiting: 0, inWork: 0};
        series[taskId] = {waiting: [], inWork: []};
    });

    const setTaskState = (caseId: number, taskId: string, state: TaskState | null) => {
        if (!counts[taskId]) return;
        let tasks = caseTasks.get(caseId);
        if (!tasks) caseTasks.set(caseId, tasks = new Map());
        const previous = tasks.get(taskId);
        if (previous) counts[taskId][previous]--;
        if (state) {
            tasks.set(taskId, state);
            counts[taskId][state]++;
        } else {
            tasks.delete(taskId);
        }
    };

    const endCase = (caseId: number) => {
        caseTasks.get(caseId)?.forEach((state, taskId) => counts[taskId][state]--);
        caseTasks.delete(caseId);
    };

    const caseArrivals: Record<string, number> = {};
    const caseEnds: Record<string, number> = {};
    const openAtStartIds = new Set(frames.map(frame => String(frame.caseId)));
    const arrivedIds = new Set<string>();
    frames.forEach(frame => {
        const arrival = frame.arrivalTime ? toUtcMs(frame.arrivalTime) : NaN;
        if (!isNaN(arrival)) caseArrivals[frame.caseId] = Math.min(arrival, startMs);
        Object.values(frame.activeElements).forEach(elementId => {
            if (taskIds.has(elementId)) setTaskState(frame.caseId, elementId, "inWork");
            else if (taskIds.has(flowTargets[elementId])) setTaskState(frame.caseId, flowTargets[elementId], "waiting");
        });
    });

    const open: number[] = [];
    let openCases = frames.length;
    let index = 0;
    const sample = () => {
        open.push(openCases);
        taskIds.forEach(taskId => {
            series[taskId].waiting.push(counts[taskId].waiting);
            series[taskId].inWork.push(counts[taskId].inWork);
        });
    };

    for (let i = 0; i < sampleCount; i++) {
        const sampleMs = startMs + i * stepMs;
        while (index < events.length && toUtcMs(events[index].timestamp) <= sampleMs) {
            const event = events[index++];
            const timestamp = toUtcMs(event.timestamp);
            switch (event.lifecycle) {
                case LifecycleTypes.CASE_ARRIVAL:
                    if (!openAtStartIds.has(String(event.caseId)) && !arrivedIds.has(String(event.caseId))) {
                        arrivedIds.add(String(event.caseId));
                        caseArrivals[event.caseId] = timestamp;
                        openCases++;
                    }
                    break;
                case LifecycleTypes.ENABLE:
                    setTaskState(event.caseId, event.nodeId, "waiting");
                    break;
                case LifecycleTypes.START:
                    setTaskState(event.caseId, event.nodeId, "inWork");
                    break;
                case LifecycleTypes.COMPLETE:
                    setTaskState(event.caseId, event.nodeId, null);
                    break;
                case LifecycleTypes.CASE_END:
                    if (caseEnds[event.caseId] === undefined) {
                        caseEnds[event.caseId] = timestamp;
                        openCases--;
                    }
                    endCase(event.caseId);
                    break;
            }
        }
        sample();
    }

    const cycleTimes = Object.entries(caseArrivals)
        .filter(([caseId]) => caseEnds[caseId] !== undefined)
        .map(([caseId, arrival]) => caseEnds[caseId] - arrival);
    const openIds = [...openAtStartIds, ...arrivedIds];

    return {
        startDate: new Date(startMs).toISOString(),
        endDate: new Date(endMs).toISOString(),
        stepMs,
        open,
        tasks: series,
        caseArrivals,
        openAtStart: openAtStartIds.size,
        openAtStartFinished: [...openAtStartIds].filter(caseId => caseEnds[caseId] !== undefined).length,
        openAtEnd: openIds.filter(caseId => caseEnds[caseId] === undefined).length,
        arrived: arrivedIds.size,
        completed: Object.keys(caseEnds).length,
        averageCycleTimeMs: cycleTimes.length ? cycleTimes.reduce((sum, value) => sum + value, 0) / cycleTimes.length : null,
    };
};

export const sampleIndexAt = (analysis: Pick<ProcessAnalysis, "startDate" | "stepMs" | "open">, moment: number): number => {
    const index = Math.floor((moment - Date.parse(analysis.startDate)) / analysis.stepMs);
    return Math.max(0, Math.min(analysis.open.length - 1, index));
};
