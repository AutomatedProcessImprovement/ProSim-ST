import { readFileSync } from 'fs';
import { join } from 'path';

const bpmnContent = readFileSync(join(__dirname, 'sample.bpmn'), 'utf-8');
const bpmnBuffer = Buffer.from(bpmnContent, 'utf-8');

// Simulation spans 3 hours in 12 batches of 15 minutes each.
// At default delta=2000ms, each batch takes ~500ms real time → full run ~6s.
// At 2x speed each batch takes ~250ms → full run ~3s, which is long enough for
// the speed-comparison test to measure a full 1s window without the simulation ending.
export const simulationFixture = {
    processId: 'test-sim-001',
    startDate: '2024-01-01 00:00:00',
    endDate: '2024-01-01 03:00:00',
    pointer: -1,
    file: bpmnBuffer.toJSON(),
    frames: [
        { caseId: 1, activeElements: { t1: 'Task_1' } },
    ],
    batches: [
        {
            startDate: '2024-01-01T00:00:00.000Z',
            endDate: '2024-01-01T00:15:00.000Z',
            events: [
                {
                    caseId: 1, lifecycle: 'COMPLETE', timestamp: '2024-01-01 00:05:00',
                    nodeId: 'EndEvent_1', paths: { t1: ['Flow_2', 'EndEvent_1'] },
                },
                {
                    caseId: 1, lifecycle: 'CASE_END', timestamp: '2024-01-01 00:10:00',
                    nodeId: 'EndEvent_1', paths: { t1: ['EndEvent_1'] },
                },
            ],
        },
        {
            startDate: '2024-01-01T00:15:00.000Z',
            endDate: '2024-01-01T00:30:00.000Z',
            events: [
                {
                    caseId: 2, lifecycle: 'CASE_ARRIVAL', timestamp: '2024-01-01 00:15:00',
                    nodeId: 'StartEvent_1', paths: {},
                },
                {
                    caseId: 2, lifecycle: 'START', timestamp: '2024-01-01 00:20:00',
                    nodeId: 'Task_1', paths: { t2: ['StartEvent_1', 'Flow_1', 'Task_1'] },
                },
            ],
        },
        {
            startDate: '2024-01-01T00:30:00.000Z',
            endDate: '2024-01-01T00:45:00.000Z',
            events: [
                {
                    caseId: 3, lifecycle: 'CASE_ARRIVAL', timestamp: '2024-01-01 00:30:00',
                    nodeId: 'StartEvent_1', paths: {},
                },
                {
                    caseId: 3, lifecycle: 'START', timestamp: '2024-01-01 00:35:00',
                    nodeId: 'Task_1', paths: { t3: ['StartEvent_1', 'Flow_1', 'Task_1'] },
                },
            ],
        },
        {
            startDate: '2024-01-01T00:45:00.000Z',
            endDate: '2024-01-01T01:00:00.000Z',
            events: [
                {
                    caseId: 2, lifecycle: 'COMPLETE', timestamp: '2024-01-01 00:45:00',
                    nodeId: 'EndEvent_1', paths: { t2: ['Flow_2', 'EndEvent_1'] },
                },
                {
                    caseId: 2, lifecycle: 'CASE_END', timestamp: '2024-01-01 00:50:00',
                    nodeId: 'EndEvent_1', paths: { t2: ['EndEvent_1'] },
                },
                {
                    caseId: 3, lifecycle: 'COMPLETE', timestamp: '2024-01-01 00:50:00',
                    nodeId: 'EndEvent_1', paths: { t3: ['Flow_2', 'EndEvent_1'] },
                },
                {
                    caseId: 3, lifecycle: 'CASE_END', timestamp: '2024-01-01 00:55:00',
                    nodeId: 'EndEvent_1', paths: { t3: ['EndEvent_1'] },
                },
            ],
        },
        // Empty batches extending the run to 3 hours so the 2x-speed test has room to measure
        { startDate: '2024-01-01T01:00:00.000Z', endDate: '2024-01-01T01:15:00.000Z', events: [] },
        { startDate: '2024-01-01T01:15:00.000Z', endDate: '2024-01-01T01:30:00.000Z', events: [] },
        { startDate: '2024-01-01T01:30:00.000Z', endDate: '2024-01-01T01:45:00.000Z', events: [] },
        { startDate: '2024-01-01T01:45:00.000Z', endDate: '2024-01-01T02:00:00.000Z', events: [] },
        { startDate: '2024-01-01T02:00:00.000Z', endDate: '2024-01-01T02:15:00.000Z', events: [] },
        { startDate: '2024-01-01T02:15:00.000Z', endDate: '2024-01-01T02:30:00.000Z', events: [] },
        { startDate: '2024-01-01T02:30:00.000Z', endDate: '2024-01-01T02:45:00.000Z', events: [] },
        { startDate: '2024-01-01T02:45:00.000Z', endDate: '2024-01-01T03:00:00.000Z', events: [] },
    ],
};

export const workloadFixture = Array.from({ length: 20 }, (_, i) => Math.floor(Math.random() * 10) + 1);

export const cycleTimeFixture = Array.from({ length: 50 }, (_, i) =>
    Math.floor(Math.sin(i / 5) * 10 + 15)
);

export const resumptionFixture = {
    frames: [{ caseId: 1, activeElements: { t1: 'Task_1' } }],
    batches: simulationFixture.batches,
    finishedCasesNumber: 0,
    wtpt: {},
    pointer: -1,
};
