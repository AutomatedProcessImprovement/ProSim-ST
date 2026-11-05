import {buildActivitiesCsv, buildLogCsv} from "@utils/activityExport";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {readTaskNames} from "@utils/processAnalysis";

const {ENABLE, START, COMPLETE, CASE_END} = LifecycleTypes;
const event = (caseId: number, lifecycle: LifecycleTypes, nodeId: string, time: string) =>
    ({caseId, lifecycle, nodeId, timestamp: `2024-01-01 ${time}`});

describe("utils/activityExport", () => {
    it("writes one row per activity instance, in the log's time zone", () => {
        const csv = buildLogCsv([
            event(1, ENABLE, "Task_A", "08:00:00"),
            event(1, START, "Task_A", "08:10:00"),
            event(1, COMPLETE, "Task_A", "08:30:00"),
            event(1, CASE_END, "End", "08:30:00"),
        ], {Task_A: "Check, then sign"}, "+02:00");

        expect(csv.split("\r\n")).toEqual([
            "case_id,activity,enable_time,start_time,end_time",
            '1,"Check, then sign",2024-01-01T10:00:00+02:00,2024-01-01T10:10:00+02:00,2024-01-01T10:30:00+02:00',
            "",
        ]);
    });

    it("keeps repeated visits apart and leaves unknown times blank", () => {
        const csv = buildLogCsv([
            event(1, COMPLETE, "Task_A", "07:00:00"),
            event(1, ENABLE, "Task_A", "08:00:00"),
            event(1, START, "Task_A", "08:00:00"),
            event(1, COMPLETE, "Task_A", "09:00:00"),
            event(1, ENABLE, "Task_A", "10:00:00"),
        ], {}, "+00:00");

        expect(csv.split("\r\n").slice(1, 4)).toEqual([
            "1,Task_A,,,2024-01-01T07:00:00+00:00",
            "1,Task_A,2024-01-01T08:00:00+00:00,2024-01-01T08:00:00+00:00,2024-01-01T09:00:00+00:00",
            "1,Task_A,2024-01-01T10:00:00+00:00,,",
        ]);
    });

    it("sums up each activity in hours, with its busiest moments", () => {
        const csv = buildActivitiesCsv(
            {Task_A: {name: "Task_A", averageWT: 1800000, averagePT: 3600000, _count: 2, incompleteCases: {}}},
            {Task_A: {waiting: [0, 3, 1], inWork: [1, 2, 0]}},
            {Task_A: "Alpha", Task_B: "Beta"},
        );

        expect(csv.split("\r\n")).toEqual([
            "activity,completed,average_waiting_hours,average_processing_hours,peak_waiting,peak_in_work",
            "Alpha,2,0.5,1,3,2",
            "Beta,0,,,0,0",
            "",
        ]);
    });

    it("reads task names from the model", () => {
        expect(readTaskNames(`<bpmn:userTask id="A" name="Sales &amp; ops"/><task name="B name" id="B"></task><serviceTask id="C"/><sequenceFlow id="F" name="no"/>`))
            .toEqual({A: "Sales & ops", B: "B name", C: ""});
    });
});
