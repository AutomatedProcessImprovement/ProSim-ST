import {FlowTypes, NodeTypes} from "@definitions/simulation/enums";

export interface Canvas {
    getContainer: () => HTMLDivElement,
}

export interface ElementRegistry {
    get: (elementId: string) => Flow | Node,
    getGraphics?: (elementId: string) => SVGElement | undefined,
}

export interface EventBus {
    on: (event: string, callback: (event: {element?: {id: string, type: string}}) => void) => void,
}

export interface BusinessObject {
    name?: string,
}

export interface Flow {
    id?: string,
    type: FlowTypes.FLOW,
    waypoints: Array<Waypoint>,
    target?: {id: string, type: string},
    businessObject?: BusinessObject,
}

export interface Node {
    id?: string,
    type: NodeTypes,
    x: number,
    y: number,
    width: number,
    height: number,
    businessObject?: BusinessObject,
    incoming?: Array<Flow>,
    outgoing?: Array<Flow>,
}

export interface Waypoint {
    x: number,
    y: number
}
