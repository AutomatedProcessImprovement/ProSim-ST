import {splitLogLines} from "@utils/fileHelpers";

export type CaseSpans = {
    starts: Float64Array;
    ends: Float64Array;
    last: number;
};

const FINAL_SHARE = 0.5;

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

export const parseLogTimestamp = (raw?: string): number => {
    const trimmed = raw?.trim();
    if (!trimmed || !ISO_TIMESTAMP.test(trimmed)) return NaN;

    const value = trimmed.replace(" ", "T").replace(/\s+/g, "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    return Date.parse(/(Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value + "Z");
};

type CaseRecord = {start: number; end: number; lastStart: number; lastActivity: string; running: boolean; activities: Set<string>};

export const buildCaseSpans = (lines: string[], caseColumn: string, activityColumn: string, startColumn: string, endColumn: string): CaseSpans => {
    const {split: splitCsvLine} = splitLogLines(lines);
    const headers = splitCsvLine(lines[0]);
    const caseIdx = headers.indexOf(caseColumn);
    const activityIdx = headers.indexOf(activityColumn);
    const startIdx = headers.indexOf(startColumn);
    const endIdx = headers.indexOf(endColumn);
    const cases = new Map<string, CaseRecord>();
    let last = -Infinity;

    if (caseIdx === -1 || endIdx === -1) return {starts: new Float64Array(), ends: new Float64Array(), last};

    for (let i = 1; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i]);
        const end = parseLogTimestamp(cells[endIdx]);
        const start = startIdx === -1 ? end : parseLogTimestamp(cells[startIdx]);
        if (Number.isNaN(start)) continue;
        const running = Number.isNaN(end);
        last = Math.max(last, start, running ? start : end);

        const activity = cells[activityIdx] ?? "";
        const record = cases.get(cells[caseIdx]);
        if (!record) {
            cases.set(cells[caseIdx], {start, end: running ? start : end, lastStart: start, lastActivity: activity, running, activities: new Set([activity])});
            continue;
        }
        record.start = Math.min(record.start, start);
        record.end = Math.max(record.end, running ? start : end);
        record.running ||= running;
        record.activities.add(activity);
        if (start >= record.lastStart) {
            record.lastStart = start;
            record.lastActivity = activity;
        }
    }

    const endings = new Map<string, number>();
    const occurrences = new Map<string, number>();
    for (const record of cases.values()) {
        endings.set(record.lastActivity, (endings.get(record.lastActivity) ?? 0) + 1);
        record.activities.forEach(activity => occurrences.set(activity, (occurrences.get(activity) ?? 0) + 1));
    }
    const isFinal = (activity: string) => (endings.get(activity) ?? 0) >= FINAL_SHARE * (occurrences.get(activity) ?? 0);

    const records = [...cases.values()];
    return {
        starts: Float64Array.from(records, record => record.start),
        ends: Float64Array.from(records, record => record.running || !isFinal(record.lastActivity) ? Infinity : record.end),
        last,
    };
};

export type OpenCasesSeries = {
    from: number;
    to: number;
    counts: number[];
    peak: number;
    peakMoment: number;
};

export const openCasesOverTime = (spans: CaseSpans, points = 120): OpenCasesSeries | null => {
    if (!spans.starts.length) return null;
    const from = spans.starts.reduce((earliest, start) => Math.min(earliest, start), Infinity);
    const to = spans.last;
    if (to <= from) return null;

    const step = (to - from) / (points - 1);
    const counts = Array.from({length: points}, (_, index) => countOngoingCases(spans, from + index * step));
    const peak = Math.max(...counts);
    return {from, to, counts, peak, peakMoment: from + counts.indexOf(peak) * step};
};

export const countOngoingCases = (spans: CaseSpans, moment: number): number => {
    let count = 0;
    for (let i = 0; i < spans.starts.length; i++) {
        if (spans.starts[i] <= moment && spans.ends[i] > moment) count++;
    }
    return count;
};
