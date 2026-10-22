import {
    ageColor,
    AGE_COLORS,
    classifyRest,
    heatOpacity,
    isTaskType,
    pointBeforeEnd,
    polylineLength,
    slotCapacity,
    slotPosition,
} from "@modules/simulation/restLayout";
import {FlowTypes, NodeTypes} from "@definitions/simulation/enums";

const flowTo = (type: string) => ({
    type: FlowTypes.FLOW,
    waypoints: [{x: 0, y: 0}, {x: 0, y: 20}, {x: 50, y: 20}],
    target: {id: "Target", type},
});
const task = {type: NodeTypes.TASK, x: 100, y: 0, width: 100, height: 80};

describe("classifyRest", () => {
    it("tells waiting, working, waiting for branches and other places apart", () => {
        expect(classifyRest("Flow_1", flowTo("bpmn:UserTask"))).toEqual({kind: "waiting", groupId: "Flow_1", taskId: "Target"});
        expect(classifyRest("Task_1", task)).toEqual({kind: "working", groupId: "Task_1", taskId: "Task_1"});
        expect(classifyRest("Flow_2", flowTo(NodeTypes.PARALLEL_GATEWAY))).toEqual({kind: "sync", groupId: "Flow_2"});
        expect(classifyRest("Flow_3", flowTo(NodeTypes.END_EVENT))).toEqual({kind: "other", groupId: "Flow_3"});
        expect(classifyRest("Gateway", {type: NodeTypes.EXCLUSIVE_GATEWAY})).toEqual({kind: "other", groupId: "Gateway"});
        expect(classifyRest("Missing", undefined)).toBeNull();
    });

    it("treats every BPMN task type as a task", () => {
        expect(isTaskType("bpmn:Task")).toBe(true);
        expect(isTaskType("bpmn:ServiceTask")).toBe(true);
        expect(isTaskType("bpmn:ExclusiveGateway")).toBe(false);
        expect(isTaskType(undefined)).toBe(false);
    });
});

describe("slot positions", () => {
    it("walks back along a bent arrow from its head", () => {
        const waypoints = flowTo("bpmn:Task").waypoints;
        expect(pointBeforeEnd(waypoints, 10)).toEqual({x: 40, y: 20});
        expect(pointBeforeEnd(waypoints, 60)).toEqual({x: 0, y: 10});
        expect(pointBeforeEnd(waypoints, 500)).toEqual({x: 0, y: 0});
    });

    it("queues on arrows, lines up under tasks and gathers around other elements", () => {
        expect(slotPosition(flowTo("bpmn:Task"), 0, 3)).toEqual({x: 40, y: 20});
        expect(slotPosition(flowTo("bpmn:Task"), 1, 3)).toEqual({x: 26, y: 20});
        expect(slotPosition(task, 0, 1)).toEqual({x: 150, y: 70});
        expect(slotPosition(task, 0, 3)).toEqual({x: 136, y: 70});
        expect(slotPosition({type: NodeTypes.EXCLUSIVE_GATEWAY, x: 0, y: 0, width: 50, height: 50}, 0, 2)).toEqual({x: 25, y: 25});
        expect(slotPosition({type: FlowTypes.FLOW, waypoints: []}, 0, 1)).toEqual({x: 0, y: 0});
    });
});

describe("slot capacity", () => {
    it("fits as many dots as the arrow is long, at least one and at most five", () => {
        const arrow = (length: number) => ({type: FlowTypes.FLOW, waypoints: [{x: 0, y: 0}, {x: length, y: 0}]});
        expect(polylineLength(flowTo("bpmn:Task").waypoints)).toBe(70);
        expect(slotCapacity(arrow(10))).toBe(1);
        expect(slotCapacity(arrow(30))).toBe(2);
        expect(slotCapacity(arrow(64))).toBe(4);
        expect(slotCapacity(arrow(500))).toBe(5);
    });

    it("fits as many dots as the task is wide", () => {
        expect(slotCapacity(task)).toBe(5);
        expect(slotCapacity({...task, width: 50})).toBe(3);
        expect(slotCapacity({...task, width: 10})).toBe(1);
        expect(slotCapacity({type: NodeTypes.EXCLUSIVE_GATEWAY})).toBe(5);
    });
});

describe("colours and shading", () => {
    it("colours by age against the average cycle time", () => {
        expect(ageColor(1, 10)).toBe(AGE_COLORS.young);
        expect(ageColor(15, 10)).toBe(AGE_COLORS.late);
        expect(ageColor(25, 10)).toBe(AGE_COLORS.overdue);
        expect(ageColor(null, 10)).toBe(AGE_COLORS.unknown);
        expect(ageColor(5, null)).toBe(AGE_COLORS.unknown);
    });

    it("shades by queue length relative to the busiest task, never strongly for a few cases", () => {
        expect(heatOpacity(0, 10)).toBe(0);
        expect(heatOpacity(10, 10)).toBeCloseTo(0.62);
        expect(heatOpacity(1, 1)).toBeCloseTo(0.22);
    });
});
