import {DISCOVER_ENABLEMENT, suggestMapping} from "@utils/columnMapping";

describe("suggestMapping", () => {
    it("maps the loan application sample log without assigning a column twice", () => {
        expect(suggestMapping(["CaseId", "Activity", "enabled_time", "StartTime", "EndTime", "Resource"])).toEqual({
            case: "CaseId",
            activity: "Activity",
            enablement: DISCOVER_ENABLEMENT,
            start: "StartTime",
            end: "EndTime",
            resource: "Resource",
        });
    });

    it("prefers the end timestamp over other columns that look alike", () => {
        const mapping = suggestMapping(["CaseId", "Resource", "role", "Activity", "Complete", "Supplier",
            "StartTime", "EndTime", "enable_time"]);
        expect(mapping.end).toBe("EndTime");
        expect(mapping.start).toBe("StartTime");
    });

    it("recognizes common column names regardless of case and separators", () => {
        expect(suggestMapping(["case:concept:name", "concept:name", "start_timestamp", "time:timestamp", "org:resource"]))
            .toEqual({
                case: "case:concept:name",
                activity: "concept:name",
                enablement: DISCOVER_ENABLEMENT,
                start: "start_timestamp",
                end: "time:timestamp",
                resource: "org:resource",
            });
    });

    it("falls back to the closest unused column", () => {
        const mapping = suggestMapping(["id", "what", "begin", "finish", "who"]);
        expect(new Set(Object.values(mapping)).size).toBe(Object.keys(mapping).length);
    });
});
