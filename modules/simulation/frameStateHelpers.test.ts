import {LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";
import {BatchEvent, FrameCase} from "@definitions/simulation/types";
import {applyEventToFrames, replayOpenCases} from "@modules/simulation/frameStateHelpers";

function makeEvent(overrides: Partial<BatchEvent>): BatchEvent {
	return {
		caseId: 1,
		lifecycle: LifecycleTypes.START,
		timestamp: "2024-01-01T00:00:00.000Z",
		nodeId: "Task_A",
		paths: {t1: ["Task_A", "Task_B"]},
		...overrides,
	};
}

describe("applyEventToFrames", () => {
	it("adds a frame and increments ongoing on CASE_ARRIVAL", () => {
		const result = applyEventToFrames([], makeEvent({
			lifecycle: LifecycleTypes.CASE_ARRIVAL,
			paths: {t1: ["start", "Task_A"]},
		}), () => undefined);

		expect(result.frames).toEqual([{caseId: 1, activeElements: {t1: "Task_A"}}]);
		expect(result.countersDelta).toEqual({ongoing: 1, finished: 0});
	});

	it("updates active element for START/ENABLE/COMPLETE", () => {
		const initial: FrameCase[] = [{caseId: 1, activeElements: {t1: "Task_A"}}];
		const result = applyEventToFrames(initial, makeEvent({
			lifecycle: LifecycleTypes.START,
			paths: {t1: ["Task_A", "Task_B"]},
		}), () => undefined);

		expect(result.frames).toEqual([{caseId: 1, activeElements: {t1: "Task_B"}}]);
		expect(result.countersDelta).toEqual({ongoing: 0, finished: 0});
	});

	it("keeps frames unchanged when single-token update references missing case", () => {
		const initial: FrameCase[] = [{caseId: 2, activeElements: {t1: "Task_A"}}];
		const result = applyEventToFrames(initial, makeEvent({
			lifecycle: LifecycleTypes.START,
			paths: {t1: ["Task_A", "Task_B"]},
		}), () => undefined);

		expect(result.frames).toEqual(initial);
	});

	it("returns unchanged state when event contains no token paths", () => {
		const initial: FrameCase[] = [{caseId: 1, activeElements: {t1: "Task_A"}}];
		const result = applyEventToFrames(initial, makeEvent({paths: {}}), () => undefined);

		expect(result.frames).toEqual(initial);
		expect(result.countersDelta).toEqual({ongoing: 0, finished: 0});
	});

	it("removes frame and adjusts counters on CASE_END", () => {
		const initial: FrameCase[] = [
			{caseId: 1, activeElements: {t1: "Task_B"}},
			{caseId: 2, activeElements: {t2: "Task_C"}},
		];
		const result = applyEventToFrames(initial, makeEvent({
			lifecycle: LifecycleTypes.CASE_END,
			paths: {t1: ["Task_B"]},
		}), () => undefined);

		expect(result.frames).toEqual([{caseId: 2, activeElements: {t2: "Task_C"}}]);
		expect(result.countersDelta).toEqual({ongoing: -1, finished: 1});
	});

	it("adds branch token when path starts at parallel gateway", () => {
		const initial: FrameCase[] = [{caseId: 1, activeElements: {main: "PGW"}}];
		const nodeType = (elementId: string) => (elementId === "PGW" ? NodeTypes.PARALLEL_GATEWAY : NodeTypes.TASK);
		const result = applyEventToFrames(initial, makeEvent({
			paths: {
				t1: ["PGW", "Task_X"],
				t2: ["PGW", "Task_Y"],
			},
		}), nodeType);

		expect(result.frames[0].activeElements.t1).toBe("Task_X");
		expect(result.frames[0].activeElements.t2).toBe("Task_Y");
	});

	it("removes branch token when destination is parallel gateway", () => {
		const initial: FrameCase[] = [{caseId: 1, activeElements: {t1: "Task_X", t2: "Task_Y"}}];
		const nodeType = (elementId: string) => (elementId === "PGW" ? NodeTypes.PARALLEL_GATEWAY : NodeTypes.TASK);
		const result = applyEventToFrames(initial, makeEvent({
			paths: {
				t1: ["Task_X", "PGW"],
				t2: ["Task_Y", "PGW"],
			},
		}), nodeType);

		expect(result.frames[0].activeElements.t1).toBeUndefined();
		expect(result.frames[0].activeElements.t2).toBeUndefined();
	});

	it("ignores multi-token branch updates when case does not exist", () => {
		const initial: FrameCase[] = [{caseId: 2, activeElements: {t1: "Task_X"}}];
		const nodeType = (elementId: string) => (elementId === "PGW" ? NodeTypes.PARALLEL_GATEWAY : NodeTypes.TASK);
		const result = applyEventToFrames(initial, makeEvent({
			paths: {
				t1: ["PGW", "Task_X"],
				t2: ["Task_Y", "PGW"],
			},
		}), nodeType);

		expect(result.frames).toEqual(initial);
	});

	it("moves every token when an event moves several without a parallel gateway", () => {
		const initial: FrameCase[] = [{caseId: 1, activeElements: {t1: "Task_X", t2: "Task_Z"}}];
		const nodeType = () => NodeTypes.TASK;
		const result = applyEventToFrames(initial, makeEvent({
			paths: {
				t1: ["Task_X", "Task_Y"],
				t2: ["Task_Z", "Task_W"],
			},
		}), nodeType);

		expect(result.frames[0].activeElements).toEqual({t1: "Task_Y", t2: "Task_W"});
	});

	it("does not remove token when destination is parallel gateway but token key is missing", () => {
		const initial: FrameCase[] = [{caseId: 1, activeElements: {t1: "Task_X"}}];
		const nodeType = (elementId: string) => (elementId === "PGW" ? NodeTypes.PARALLEL_GATEWAY : NodeTypes.TASK);
		const result = applyEventToFrames(initial, makeEvent({
			paths: {
				ghost: ["Task_Z", "PGW"],
				t1: ["Task_X", "PGW"],
			},
		}), nodeType);

		expect(result.frames[0].activeElements.t1).toBeUndefined();
	});
});

describe("replayOpenCases", () => {
	const event = (caseId: number, lifecycle: LifecycleTypes, paths: Record<string, string[]>) => ({caseId, lifecycle, paths});

	it("keeps the tokens of cases no event touched", () => {
		expect(replayOpenCases([{caseId: 1, activeElements: {token_0: "Flow_A"}}], []))
			.toEqual([{caseId: 1, activeElements: {token_0: "Flow_A"}}]);
	});

	it("follows new cases, splits and every token of an event", () => {
		const frames = replayOpenCases([], [
			event(2, LifecycleTypes.CASE_ARRIVAL, {token_0: ["start", "Flow_A"]}),
			event(2, LifecycleTypes.COMPLETE, {token_0: ["Flow_A", "split"], token_1: ["split", "Flow_B"], token_2: ["split", "Flow_C"]}),
			event(2, LifecycleTypes.START, {token_1: ["Flow_B", "Task_B"], token_2: ["Flow_C", "Flow_D"]}),
		]);

		expect(frames).toEqual([{caseId: 2, activeElements: {token_1: "Task_B", token_2: "Flow_D"}}]);
	});

	it("drops merged tokens at a join, even when they only cross the gateway", () => {
		const frames = replayOpenCases([{caseId: 1, activeElements: {token_0: "Flow_A", token_1: "Flow_B"}}], [
			event(1, LifecycleTypes.COMPLETE, {token_0: ["join"], token_1: ["Flow_B", "join"], token_2: ["join", "Flow_C"]}),
		]);

		expect(frames).toEqual([{caseId: 1, activeElements: {token_2: "Flow_C"}}]);
	});

	it("leaves a token in place on events without paths and removes ended cases", () => {
		const frames = replayOpenCases([
			{caseId: 1, activeElements: {token_0: "Flow_A"}, arrivalTime: "2024-01-01T00:00:00.000Z"},
			{caseId: 2, activeElements: {token_0: "Flow_B"}},
		], [
			event(1, LifecycleTypes.ENABLE, {}),
			event(2, LifecycleTypes.CASE_END, {token_0: ["Flow_B", "end"]}),
		]);

		expect(frames).toEqual([{caseId: 1, activeElements: {token_0: "Flow_A"}}]);
	});
});
