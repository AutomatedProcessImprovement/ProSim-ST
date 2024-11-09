import {ElementTypes} from "@utils/customTypes/simulation/enums";

export interface Canvas {
    getContainer: () => HTMLDivElement,
}

export interface ElementInterface {
    get: (elementId: string) => Flow | Task,
}

interface Flow {
    type: ElementTypes.Flow,
    waypoints: Array<Waypoint>,
}

interface Task {
    type: ElementTypes.Task,
    outgoing: Array<Flow>,
    x: number,
    y: number,
    width: number,
    height: number,
}

interface Waypoint {
    x: number,
    y: number
}
