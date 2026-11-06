import {Waypoint} from "@definitions/simulation/interfaces";
import {FlowTypes, NodeTypes} from "@definitions/simulation/enums";

export type RestKind = "waiting" | "working" | "sync" | "other";

export type RestPlace = {
    kind: RestKind;
    groupId: string;
    taskId?: string;
};

export type Rest = {
    caseId: number;
    tokenId: string;
    elementId: string;
    place: RestPlace;
};

type LayoutElement = {
    id?: string;
    type: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    waypoints?: Waypoint[];
    target?: {id: string; type: string};
};

export const MAX_VISIBLE_DOTS = 5;
export const DOT_RADIUS = 6;
const DOT_SPACING = 14;
const QUEUE_OFFSET = 10;
const TASK_INSET = 4;

export const isTaskType = (type?: string) => Boolean(type && /Task$/.test(type));

export function classifyRest(elementId: string, element?: LayoutElement): RestPlace | null {
    if (!element) return null;

    if (element.type === FlowTypes.FLOW) {
        const target = element.target;
        if (target && isTaskType(target.type)) return {kind: "waiting", groupId: elementId, taskId: target.id};
        if (target?.type === NodeTypes.PARALLEL_GATEWAY) return {kind: "sync", groupId: elementId};
        return {kind: "other", groupId: elementId};
    }

    if (isTaskType(element.type)) return {kind: "working", groupId: elementId, taskId: elementId};
    return {kind: "other", groupId: elementId};
}

export function pointBeforeEnd(waypoints: Waypoint[], distance: number): Waypoint {
    let remaining = distance;
    for (let i = waypoints.length - 1; i > 0; i--) {
        const end = waypoints[i];
        const start = waypoints[i - 1];
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        if (length >= remaining && length > 0) {
            const ratio = remaining / length;
            return {x: end.x + (start.x - end.x) * ratio, y: end.y + (start.y - end.y) * ratio};
        }
        remaining -= length;
    }
    return waypoints[0];
}

export function polylineLength(waypoints: Waypoint[]): number {
    let length = 0;
    for (let i = 1; i < waypoints.length; i++) {
        length += Math.hypot(waypoints[i].x - waypoints[i - 1].x, waypoints[i].y - waypoints[i - 1].y);
    }
    return length;
}

export function slotCapacity(element: LayoutElement): number {
    let fitting = MAX_VISIBLE_DOTS;
    if (element.type === FlowTypes.FLOW) {
        fitting = Math.floor((polylineLength(element.waypoints ?? []) - QUEUE_OFFSET - DOT_RADIUS) / DOT_SPACING) + 1;
    } else if (isTaskType(element.type)) {
        fitting = Math.floor(((element.width ?? 0) - 2 * (TASK_INSET + DOT_RADIUS)) / DOT_SPACING) + 1;
    }
    return Math.max(1, Math.min(MAX_VISIBLE_DOTS, fitting));
}

export function slotPosition(element: LayoutElement, index: number, count: number): Waypoint {
    if (element.type === FlowTypes.FLOW) {
        const waypoints = element.waypoints ?? [];
        if (!waypoints.length) return {x: 0, y: 0};
        return pointBeforeEnd(waypoints, QUEUE_OFFSET + index * DOT_SPACING);
    }

    const {x = 0, y = 0, width = 0, height = 0} = element;
    const centreX = x + width / 2;

    if (isTaskType(element.type)) {
        return {x: centreX + (index - (count - 1) / 2) * DOT_SPACING, y: y + height - DOT_RADIUS - TASK_INSET};
    }

    if (index === 0) return {x: centreX, y: y + height / 2};
    const angle = (index - 1) * Math.PI / 2 - Math.PI / 4;
    return {x: centreX + Math.cos(angle) * DOT_SPACING, y: y + height / 2 + Math.sin(angle) * DOT_SPACING};
}

const PILL_HEIGHT = 19;
const PILL_GAP = 4;

export const pillWidth = (label: string) => label.length * 7.4 + 14;

function segmentHitsBox(start: Waypoint, end: Waypoint, box: Waypoint & {width: number; height: number}) {
    const steps = Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / 4) + 1;
    for (let step = 0; step <= steps; step++) {
        const x = start.x + (end.x - start.x) * step / steps;
        const y = start.y + (end.y - start.y) * step / steps;
        if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) return true;
    }
    return false;
}

export function clearPillSpot(
    shape: {x: number; y: number; width: number; height: number},
    width: number,
    flows: Waypoint[][],
): Waypoint {
    const centred = shape.x + shape.width / 2 - width / 2;
    const above = shape.y - PILL_HEIGHT - PILL_GAP;
    const below = shape.y + shape.height + PILL_GAP;
    const left = shape.x - width + shape.width / 2 - PILL_GAP;
    const right = shape.x + shape.width / 2 + PILL_GAP;
    const spots = [
        {x: centred, y: above},
        {x: centred, y: below},
        {x: right, y: above},
        {x: left, y: above},
        {x: right, y: below},
        {x: left, y: below},
    ];

    const isClear = (spot: Waypoint) => flows.every(waypoints => waypoints.slice(1).every((point, index) =>
        !segmentHitsBox(waypoints[index], point, {...spot, width, height: PILL_HEIGHT})));
    return spots.find(isClear) ?? spots[0];
}

export const STATE_COLORS: Record<RestKind | "moving", string> = {
    waiting: "#f59e0b",
    working: "#0f766e",
    sync: "#94a3b8",
    other: "#94a3b8",
    moving: "#1e293b",
};

export const AGE_COLORS = {
    young: "#2563eb",
    late: "#f59e0b",
    overdue: "#991b1b",
    unknown: "#94a3b8",
};

export const ORIGIN_COLORS = {
    ongoing: "#2563eb",
    arrived: "#94a3b8",
};

export function ageColor(ageMs: number | null, averageCycleTimeMs: number | null): string {
    if (ageMs === null || !averageCycleTimeMs) return AGE_COLORS.unknown;
    if (ageMs < averageCycleTimeMs) return AGE_COLORS.young;
    if (ageMs < 2 * averageCycleTimeMs) return AGE_COLORS.late;
    return AGE_COLORS.overdue;
}

export function heatOpacity(waiting: number, maxWaiting: number): number {
    if (waiting <= 0) return 0;
    return 0.12 + 0.5 * Math.min(1, waiting / Math.max(maxWaiting, MAX_VISIBLE_DOTS));
}
