import {readLines} from "@utils/fileHelpers";

// For every case in the log: when its first activity started and when its last activity ended (ms since epoch)
export type CaseSpans = {
    starts: Float64Array;
    ends: Float64Array;
};

const splitCsvLine = (line: string) => line.split(/[;,]/);

// Log timestamps such as "2025-02-17 09:00:00.646000+02:00"; timestamps without an offset are UTC, as elsewhere
export const parseLogTimestamp = (raw?: string): number => {
    const value = raw?.trim().replace(" ", "T");
    if (!value) return NaN;

    const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(value) && /T\d/.test(value);
    return Date.parse(hasOffset ? value : value + "Z");
};

export const buildCaseSpans = (lines: string[], caseColumn: string, startColumn: string, endColumn: string): CaseSpans => {
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

export const readCaseSpans = async (logFile: File, caseColumn: string, startColumn: string, endColumn: string) => {
    const lines = await readLines(logFile, {removeWhite: true});
    return buildCaseSpans(lines, caseColumn, startColumn, endColumn);
};

// Cases that started at or before the moment and still have activities ending after it
export const countOngoingCases = (spans: CaseSpans, moment: number): number => {
    let count = 0;
    for (let i = 0; i < spans.starts.length; i++) {
        if (spans.starts[i] <= moment && spans.ends[i] > moment) count++;
    }
    return count;
};
