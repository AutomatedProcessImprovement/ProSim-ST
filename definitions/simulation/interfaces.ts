import {FlowTypes, NodeTypes} from "@definitions/simulation/enums";

export interface Canvas {
    getContainer: () => HTMLDivElement,
}

export interface ElementRegistry {
    get: (elementId: string) => Flow | Node,
}

export interface Flow {
    type: FlowTypes.FLOW,
    waypoints: Array<Waypoint>,
}

export interface Node {
    type: NodeTypes,
    x: number,
    y: number,
    width: number,
    height: number,
}

interface Task extends Node {
    type: NodeTypes.TASK,
    outgoing: Flow,
}

interface Gateway extends Node {
    type: NodeTypes.GATEWAY,
    outgoings: Array<Flow>,
}

export interface Waypoint {
    x: number,
    y: number
}
