export enum NodeTypes {
    TASK = 'bpmn:Task',
    PARALLEL_GATEWAY = 'bpmn:ParallelGateway',
    EXCLUSIVE_GATEWAY = 'bpmn:ExclusiveGateway',
    START_EVENT = 'bpmn:StartEvent',
    END_EVENT = 'bpmn:EndEvent',
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
