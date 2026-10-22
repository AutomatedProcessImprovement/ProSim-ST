import {buildProcessAnalysis, readFlowTargets, sampleIndexAt, toUtcMs} from "@utils/processAnalysis";
import {LifecycleTypes} from "@definitions/simulation/enums";

const HOUR = 3600000;

const event = (caseId: number, lifecycle: LifecycleTypes, timestamp: string, nodeId: string | null = null) =>
    ({caseId, lifecycle, timestamp, nodeId});

describe("toUtcMs", () => {
    it("reads stored timestamps as UTC and keeps explicit offsets", () => {
        expect(toUtcMs("2025-04-04 13:46:14")).toBe(Date.UTC(2025, 3, 4, 13, 46, 14));
        expect(toUtcMs("2025-04-04T13:46:14Z")).toBe(Date.UTC(2025, 3, 4, 13, 46, 14));
        expect(toUtcMs("2025-04-04T15:46:14+02:00")).toBe(Date.UTC(2025, 3, 4, 13, 46, 14));
    });
});

describe("readFlowTargets", () => {
    it("maps sequence flows to their targets whatever the attribute order or prefix", () => {
        const xml = `
            <bpmn:sequenceFlow id="Flow_1" sourceRef="Start" targetRef="Task_A" />
            <sequenceFlow targetRef="Task_B" id="Flow_2" sourceRef="Task_A"></sequenceFlow>
            <bpmn:task id="Task_A" name="A" />`;
        expect(readFlowTargets(xml)).toEqual({Flow_1: "Task_A", Flow_2: "Task_B"});
    });
});

describe("buildProcessAnalysis", () => {
    const start = "2024-01-01 00:00:00";
    const end = "2024-01-01 04:00:00";

    it("tracks waiting and in-work cases per task over time", () => {
        const analysis = buildProcessAnalysis([
            event(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01 00:30:00", "Start"),
            event(1, LifecycleTypes.ENABLE, "2024-01-01 00:30:00", "Task_A"),
            event(2, LifecycleTypes.CASE_ARRIVAL, "2024-01-01 00:40:00", "Start"),
            event(2, LifecycleTypes.ENABLE, "2024-01-01 00:40:00", "Task_A"),
            event(1, LifecycleTypes.START, "2024-01-01 01:30:00", "Task_A"),
            event(1, LifecycleTypes.COMPLETE, "2024-01-01 02:30:00", "Task_A"),
            event(1, LifecycleTypes.CASE_END, "2024-01-01 02:30:00", "End"),
        ], [], {}, start, end);

        expect(analysis.stepMs).toBe(3600000);
        expect(analysis.open).toEqual([0, 2, 2, 1, 1]);
        expect(analysis.tasks.Task_A).toEqual({
            waiting: [0, 2, 1, 1, 1],
            inWork: [0, 0, 1, 0, 0],
        });
        expect(analysis.arrived).toBe(2);
        expect(analysis.completed).toBe(1);
        expect(analysis.openAtEnd).toBe(1);
        expect(analysis.averageCycleTimeMs).toBe(2 * 3600000);
    });

    it("counts the cases running at the start apart from the ones arriving at it", () => {
        const analysis = buildProcessAnalysis([
            event(5, LifecycleTypes.CASE_ARRIVAL, start, "Start"),
            event(5, LifecycleTypes.ENABLE, start, "Task_A"),
            event(5, LifecycleTypes.START, start, "Task_A"),
            event(5, LifecycleTypes.COMPLETE, "2024-01-01 01:00:00", "Task_A"),
            event(5, LifecycleTypes.CASE_END, "2024-01-01 01:00:00", "End"),
            event(7, LifecycleTypes.START, "2024-01-01 02:00:00", "Task_A"),
            event(6, LifecycleTypes.COMPLETE, "2024-01-01 03:00:00", "Task_B"),
        ], [
            {caseId: 6, activeElements: {token_0: "Task_B"}},
            {caseId: 7, activeElements: {token_0: "Flow_to_A"}},
        ], {Flow_to_A: "Task_A"}, start, end);

        expect(analysis.openAtStart).toBe(2);
        expect(analysis.openAtStartFinished).toBe(0);
        expect(analysis.arrived).toBe(1);
        expect(analysis.open[0]).toBe(3);
        expect(analysis.tasks.Task_A.waiting).toEqual([1, 1, 0, 0, 0]);
        expect(analysis.tasks.Task_A.inWork).toEqual([1, 0, 1, 1, 1]);
        expect(analysis.tasks.Task_B.inWork).toEqual([1, 1, 1, 0, 0]);
        // The log does not say when cases 6 and 7 started
        expect(analysis.caseArrivals[6]).toBeUndefined();
        expect(analysis.caseArrivals[5]).toBe(toUtcMs(start));
        expect(analysis.averageCycleTimeMs).toBe(HOUR);
    });

    it("dates the cases running at the start from the event log, and counts them in the cycle time once finished", () => {
        const analysis = buildProcessAnalysis([
            event(6, LifecycleTypes.COMPLETE, "2024-01-01 03:00:00", "Task_B"),
            event(6, LifecycleTypes.CASE_END, "2024-01-01 03:00:00", "End"),
        ], [
            {caseId: 6, activeElements: {token_0: "Task_B"}, arrivalTime: "2023-12-31T21:00:00.000Z"},
            {caseId: 7, activeElements: {token_0: "Flow_to_A"}, arrivalTime: "2023-12-30T00:00:00.000Z"},
        ], {Flow_to_A: "Task_A"}, start, end);

        expect(analysis.caseArrivals[6]).toBe(Date.UTC(2023, 11, 31, 21));
        expect(analysis.caseArrivals[7]).toBe(Date.UTC(2023, 11, 30));
        expect(analysis.openAtStart).toBe(2);
        expect(analysis.openAtStartFinished).toBe(1);
        expect(analysis.openAtEnd).toBe(1);
        // Case 6: from 21:00 the day before to 03:00
        expect(analysis.averageCycleTimeMs).toBe(6 * HOUR);
    });

    it("clears every task of a case when it ends", () => {
        const analysis = buildProcessAnalysis([
            event(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01 00:10:00", "Start"),
            event(1, LifecycleTypes.ENABLE, "2024-01-01 00:10:00", "Task_A"),
            event(1, LifecycleTypes.ENABLE, "2024-01-01 00:10:00", "Task_B"),
            event(1, LifecycleTypes.CASE_END, "2024-01-01 01:10:00", "End"),
        ], [], {}, start, end);

        expect(analysis.tasks.Task_A.waiting).toEqual([0, 1, 0, 0, 0]);
        expect(analysis.tasks.Task_B.waiting).toEqual([0, 1, 0, 0, 0]);
    });

    it("keeps long simulations to a bounded number of samples", () => {
        const analysis = buildProcessAnalysis([], [], {}, "2024-01-01 00:00:00", "2024-12-31 00:00:00");
        expect(analysis.open.length).toBeLessThanOrEqual(1501);
        expect(analysis.stepMs).toBeGreaterThan(3600000);
    });

    it("finds the sample for a moment", () => {
        const analysis = buildProcessAnalysis([], [], {}, start, end);
        expect(sampleIndexAt(analysis, toUtcMs("2024-01-01 02:59:00"))).toBe(2);
        expect(sampleIndexAt(analysis, toUtcMs("2023-12-31 00:00:00"))).toBe(0);
        expect(sampleIndexAt(analysis, toUtcMs("2024-02-01 00:00:00"))).toBe(4);
    });
});
