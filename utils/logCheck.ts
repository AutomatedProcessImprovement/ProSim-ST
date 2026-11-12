import {formatInLogTime} from "@utils/dateHelpers";
import {getLogUtcOffset, splitLogLines} from "@utils/fileHelpers";
import {parseLogTimestamp} from "@utils/ongoingCases";
import {DISCOVER_ENABLEMENT} from "@utils/columnMapping";

export const TIMESTAMP_HINT = "Use ISO 8601 timestamps such as 2025-03-25 10:00:00 or 2025-03-25T10:00:00+02:00.";

const LABELS: Record<string, string> = {
    case: "Case ID",
    activity: "Activity",
    start: "Start timestamp",
    end: "End timestamp",
    enablement: "Enablement timestamp",
    resource: "Resource",
};

const HAS_OFFSET = /(Z|[+-]\d{2}:?\d{2})$/;

export type LogCheck = {
    issues: string[];
    startDate?: string;
    endDate?: string;
    utcOffset: string;
};

const rows = (count: number) => `${count} ${count === 1 ? "row" : "rows"}`;

export const checkLogColumns = (lines: string[], mapping: Record<string, string>): LogCheck => {
    const {split} = splitLogLines(lines);
    const headers = split(lines[0]);
    const issues: string[] = [];
    const fields = ["case", "activity", "start", "end", "resource"];
    if (mapping.enablement && mapping.enablement !== DISCOVER_ENABLEMENT) fields.push("enablement");

    const index = Object.fromEntries(fields.map(field => [field, headers.indexOf(mapping[field])]));
    const unmapped = fields.filter(field => index[field] === -1);
    if (unmapped.length) {
        return {issues: [`Choose a column for ${unmapped.map(field => LABELS[field]).join(", ")}.`], utcOffset: "+00:00"};
    }

    const timeFields = fields.filter(field => ["start", "end", "enablement"].includes(field));
    const empty: Record<string, {count: number; row: number}> = {};
    const unreadable: Record<string, {row: number; value: string}> = {};
    const zones: Record<string, {with: number; without: number; row: number}> = {};
    let backwards = 0;
    let firstBackwards = 0;
    let earliest = Infinity;
    let latest = -Infinity;
    let utcOffset: string | undefined;

    for (let i = 1; i < lines.length; i++) {
        const cells = split(lines[i]);
        const row = i + 1;
        for (const field of ["case", "activity"]) {
            if (!cells[index[field]]) {
                empty[field] ??= {count: 0, row};
                empty[field].count++;
            }
        }
        const times: Record<string, number> = {};
        for (const field of timeFields) {
            const value = cells[index[field]] ?? "";
            if (!value) {
                empty[field] ??= {count: 0, row};
                empty[field].count++;
                continue;
            }
            const time = parseLogTimestamp(value);
            if (Number.isNaN(time)) {
                unreadable[field] ??= {row, value};
                continue;
            }
            zones[field] ??= {with: 0, without: 0, row: 0};
            if (HAS_OFFSET.test(value)) {
                zones[field].with++;
                utcOffset ??= getLogUtcOffset(value);
            } else {
                zones[field].without++;
                zones[field].row ||= row;
            }
            times[field] = time;
        }
        if (times.start !== undefined && times.end !== undefined) {
            if (times.end < times.start) {
                backwards++;
                firstBackwards ||= row;
            }
            earliest = Math.min(earliest, times.start);
            latest = Math.max(latest, times.end);
        }
    }

    for (const field of fields) {
        const column = `column "${mapping[field]}" (${LABELS[field]})`;
        if (unreadable[field]) {
            issues.push(`The ${column} has values that are not timestamps, e.g. "${unreadable[field].value}" in row ${unreadable[field].row}. ${TIMESTAMP_HINT}`);
        } else if (empty[field]) {
            issues.push(`${rows(empty[field].count)} of the log ${empty[field].count === 1 ? "has" : "have"} an empty ${column}, the first in row ${empty[field].row}. Every event needs one.`);
        } else if (zones[field]?.with && zones[field]?.without) {
            issues.push(`The ${column} mixes timestamps with and without a time zone, e.g. row ${zones[field].row}. Give all of them a time zone or none.`);
        }
    }
    if (!issues.length && backwards) {
        issues.push(`${backwards} ${backwards === 1 ? "event ends" : "events end"} before ${backwards === 1 ? "it starts" : "they start"}, the first in row ${firstBackwards}. Check that the start and end columns are mapped the right way round.`);
    }

    const offset = utcOffset ?? "+00:00";
    return {
        issues,
        utcOffset: offset,
        ...(Number.isFinite(earliest) && {
            startDate: formatInLogTime(new Date(earliest), offset).replace(" ", "T"),
            endDate: formatInLogTime(new Date(latest), offset).replace(" ", "T"),
        }),
    };
};
