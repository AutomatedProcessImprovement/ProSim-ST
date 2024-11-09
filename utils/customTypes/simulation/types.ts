export type Tokens = {
    [key: string]: Array<SVGCircleElement>
}

export type SimulationData = {
    frame_mockup: Array<FrameCase>
}

export type FrameCase = {
    active_elements: Array<string>,
    case_id: string,
}
