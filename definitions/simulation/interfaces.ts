import {ElementTypes} from "@definitions/simulation/enums";

export interface Canvas {
    getContainer: () => HTMLDivElement,
}

export interface ElementRegistry {
    get: (elementId: string) => Flow | Task,
}

export interface Flow {
    type: ElementTypes.FLOW,
    waypoints: Array<Waypoint>,
}

interface Task {
    type: ElementTypes.TASK,
    outgoing: Array<Flow>,
    x: number,
    y: number,
    width: number,
    height: number,
}

export interface Waypoint {
    x: number,
    y: number
}
