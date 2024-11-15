export enum NodeTypes {
    TASK = 'bpmn:Task',
    GATEWAY = 'bpmn:Gateway',
}

export enum FlowTypes {
    FLOW = 'bpmn:SequenceFlow',
}

export enum LifecycleTypes {
    START = 'START',
    ENABLE = 'ENABLE',
    COMPLETE = 'COMPLETE',
    CASE_ARRIVAL = 'CASE_ARRIVAL',
    CASE_END = 'CASE_END',
}
