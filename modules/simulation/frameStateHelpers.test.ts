import {LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";
import {BatchEvent, FrameCase} from "@definitions/simulation/types";
import {applyEventToFrames} from "@modules/simulation/frameStateHelpers";

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

	it("keeps active elements unchanged when neither parallel condition matches", () => {
		const initial: FrameCase[] = [{caseId: 1, activeElements: {t1: "Task_X"}}];
		const nodeType = () => NodeTypes.TASK;
		const result = applyEventToFrames(initial, makeEvent({
			paths: {
				t1: ["Task_X", "Task_Y"],
				t2: ["Task_Z", "Task_W"],
			},
		}), nodeType);

		expect(result.frames).toEqual(initial);
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

