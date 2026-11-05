import {
    ageColor,
    AGE_COLORS,
    classifyRest,
    clearPillSpot,
    heatOpacity,
    isTaskType,
    pointBeforeEnd,
    polylineLength,
    slotCapacity,
    slotPosition,
    STATE_COLORS,
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

describe("clearPillSpot", () => {
    const gateway = {x: 100, y: 100, width: 50, height: 50};
    const fromLeft = [{x: 0, y: 125}, {x: 100, y: 125}];
    const fromAbove = [{x: 125, y: 0}, {x: 125, y: 100}];
    const fromBelow = [{x: 125, y: 250}, {x: 125, y: 150}];

    it("stays above the shape when nothing is there", () => {
        expect(clearPillSpot(gateway, 70, [fromLeft])).toEqual({x: 90, y: 77});
    });

    it("moves below when an arrow comes in from the top", () => {
        expect(clearPillSpot(gateway, 70, [fromAbove])).toEqual({x: 90, y: 154});
    });

    it("moves to the side when arrows come in from the top and the bottom", () => {
        expect(clearPillSpot(gateway, 70, [fromAbove, fromBelow])).toEqual({x: 129, y: 77});
    });

    it("stays above when every spot is taken", () => {
        const blocked = [100, 170].map(y => [{x: 0, y}, {x: 300, y}]);
        const across = [{x: 0, y: 87}, {x: 300, y: 87}];
        expect(clearPillSpot(gateway, 70, [...blocked, across, [{x: 0, y: 165}, {x: 300, y: 165}]])).toEqual({x: 90, y: 77});
    });
});

describe("dot colours under colour blindness", () => {
    const MATRICES = {
        normal: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
        protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
        deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
        tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
    };
    const linear = (channel: number) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

    const toLab = (hex: string, matrix: number[][]) => {
        const rgb = [1, 3, 5].map(index => linear(parseInt(hex.slice(index, index + 2), 16) / 255));
        const [r, g, b] = matrix.map(row => Math.min(1, Math.max(0, row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2])));
        const f = (value: number) => value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
        const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
        const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
        const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
        return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
    };

    const smallestGap = (colors: string[]) => {
        let smallest = Infinity;
        Object.values(MATRICES).forEach(matrix => colors.forEach((first, index) => colors.slice(index + 1).forEach(second => {
            const [a, b] = [toLab(first, matrix), toLab(second, matrix)];
            smallest = Math.min(smallest, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
        })));
        return smallest;
    };

    it("keeps the state colours apart", () => {
        const {waiting, working, moving, sync} = STATE_COLORS;
        expect(smallestGap([waiting, working, moving, sync])).toBeGreaterThan(20);
    });

    it("keeps the case age colours apart", () => {
        const {young, late, overdue, unknown} = AGE_COLORS;
        expect(smallestGap([young, late, overdue, unknown])).toBeGreaterThan(20);
    });
});
