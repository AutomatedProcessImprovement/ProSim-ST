import levenshtein from "js-levenshtein";

export const DISCOVER_ENABLEMENT = '__DISCOVER__';

// Mapped in this order, so the most specific fields claim their columns first
const FIELDS = ['case', 'activity', 'start', 'end', 'resource'] as const;

// Common column names for each field, compared after normalization (lowercase, letters and digits only)
const SYNONYMS: Record<typeof FIELDS[number], string[]> = {
    case: ['case', 'caseid', 'caseconceptname', 'casename', 'traceid', 'trace', 'processinstance', 'instanceid'],
    activity: ['activity', 'activityname', 'conceptname', 'task', 'taskname', 'event', 'eventname', 'action'],
    start: ['start', 'starttime', 'starttimestamp', 'startdate', 'startdatetime', 'timestart', 'started'],
    end: ['end', 'endtime', 'endtimestamp', 'enddate', 'enddatetime', 'complete', 'completetime',
        'completetimestamp', 'completiontime', 'timecomplete', 'timetimestamp', 'timestamp', 'finished'],
    resource: ['resource', 'orgresource', 'resourceid', 'resourcename', 'user', 'agent', 'performer', 'worker', 'employee'],
};

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

// Suggests a CSV column for every mandatory log attribute. A column is used for at most one attribute while
// unused columns remain, so the suggestion passes the duplicate check whenever the log has enough columns.
export const suggestMapping = (headers: string[]): Record<string, string> => {
    const mapping: Record<string, string> = { enablement: DISCOVER_ENABLEMENT };
    const used = new Set<string>();

    for (const field of FIELDS) {
        const free = headers.filter(header => !used.has(header));
        const candidates = free.length > 0 ? free : headers;
        if (candidates.length === 0) break;

        const synonyms = SYNONYMS[field];
        const byName = synonyms
            .map(synonym => candidates.find(header => normalize(header) === synonym))
            .find(Boolean);
        const byKeyword = candidates.find(header => normalize(header).includes(field));
        const byDistance = [...candidates].sort(
            (a, b) => levenshtein(normalize(a), field) - levenshtein(normalize(b), field)
        )[0];

        const match = byName ?? byKeyword ?? byDistance;
        mapping[field] = match;
        used.add(match);
    }

    return mapping;
};
