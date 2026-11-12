import {splitLogLines} from "@utils/fileHelpers";

export type CaseSpans = {
    starts: Float64Array;
    ends: Float64Array;
};

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/;

export const parseLogTimestamp = (raw?: string): number => {
    const trimmed = raw?.trim();
    if (!trimmed || !ISO_TIMESTAMP.test(trimmed)) return NaN;

    const value = trimmed.replace(" ", "T").replace(/\s+/g, "").replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
    return Date.parse(/(Z|[+-]\d{2}:\d{2})$/.test(value) ? value : value + "Z");
};

export const buildCaseSpans = (lines: string[], caseColumn: string, startColumn: string, endColumn: string): CaseSpans => {
    const {split: splitCsvLine} = splitLogLines(lines);
    const headers = splitCsvLine(lines[0]);
    const caseIdx = headers.indexOf(caseColumn);
    const startIdx = headers.indexOf(startColumn);
    const endIdx = headers.indexOf(endColumn);
    const spans = new Map<string, [number, number]>();

    if (caseIdx === -1 || endIdx === -1) return {starts: new Float64Array(), ends: new Float64Array()};

    for (let i = 1; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i]);
        const end = parseLogTimestamp(cells[endIdx]);
        const start = startIdx === -1 ? end : parseLogTimestamp(cells[startIdx]);
        if (Number.isNaN(start) || Number.isNaN(end)) continue;

        const span = spans.get(cells[caseIdx]);
        if (span) {
            span[0] = Math.min(span[0], start);
            span[1] = Math.max(span[1], end);
        } else {
            spans.set(cells[caseIdx], [start, end]);
        }
    }

    const values = [...spans.values()];
    return {
        starts: Float64Array.from(values, ([start]) => start),
        ends: Float64Array.from(values, ([, end]) => end),
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
    const to = spans.ends.reduce((latest, end) => Math.max(latest, end), -Infinity);
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
