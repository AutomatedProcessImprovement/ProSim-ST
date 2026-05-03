/**
 * Integration test: POST /api/simulation
 *
 * Verifies that the creation handler persists simulation data to real MySQL
 * and caches frames in real Redis when the Python microservice responds.
 */

jest.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: {status?: number}) => ({body, status: init?.status ?? 200}),
    },
}));

jest.mock('fs/promises', () => {
    const real = jest.requireActual<typeof import('fs/promises')>('fs/promises');
    return {
        ...real,
        // No-op writes to public/assets; let testcontainers use the real writeFile elsewhere
        writeFile: jest.fn((path: string, data: unknown, ...args: unknown[]) => {
            if (typeof path === 'string' && path.includes('public/assets')) {
                return Promise.resolve();
            }
            return real.writeFile(path as never, data as never, ...(args as never[]));
        }),
    };
});

jest.mock('fs', () => {
    const real = jest.requireActual<typeof import('fs')>('fs');
    return {
        ...real,
        // Route handler checks/creates public/assets dir; everything else uses the real fs
        existsSync: jest.fn((path: string) => {
            if (typeof path === 'string' && path.includes('public/assets')) return true;
            return real.existsSync(path);
        }),
        mkdirSync: jest.fn((path: string, ...args: unknown[]) => {
            if (typeof path === 'string' && path.includes('public/assets')) return undefined;
            return real.mkdirSync(path as never, ...(args as never[]));
        }),
    };
});

jest.mock('axios', () => ({default: {post: jest.fn()}, post: jest.fn()}));

jest.mock('@db/mysql/typeorm', () => ({createMySQLConnection: jest.fn()}));

jest.mock('@db/redis/redis', () => ({
    getRedisInstance: jest.fn(),
    REDIS_KEY_PREFIX_FRAMES: 'frames:',
    REDIS_KEY_PREFIX_WORKLOAD: 'workload:',
    REDIS_KEY_PREFIX_CYCLE_TIME: 'cycle-time:',
}));

import {POST} from '../app/api/simulation/route';
import {createMySQLConnection} from '@db/mysql/typeorm';
import {getRedisInstance} from '@db/redis/redis';
import axios from 'axios';
import {startTestDb, stopTestDb, clearTables, TestDb} from './helpers/db';
import {startTestRedis, stopTestRedis, makeRedisFactory, TestRedis} from './helpers/redis';

const PROCESS_ID = 'integ-create-001';

describe('POST /api/simulation (integration)', () => {
    let db: TestDb;
    let redisTest: TestRedis;

    beforeAll(async () => {
        db = await startTestDb();
        redisTest = await startTestRedis();
    });

    afterAll(async () => {
        await stopTestDb(db);
        await stopTestRedis(redisTest);
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        await clearTables(db.dataSource);
        await redisTest.client.flushall();

        (createMySQLConnection as jest.Mock).mockResolvedValue(db.dataSource);
        (getRedisInstance as jest.Mock).mockImplementation(makeRedisFactory(redisTest.container));
    });

    it('saves Process, Event, and Frame rows to MySQL and caches frames in Redis', async () => {
        const pyEvents = [
            {case_id: 1, lifecycle: 'CASE_ARRIVAL', timestamp: '2024-01-01T00:00:00.000Z', node_id: 'start', paths: {}},
            {case_id: 1, lifecycle: 'START',        timestamp: '2024-01-01T01:00:00.000Z', node_id: 'task1', paths: {t1: ['task1']}},
            {case_id: 1, lifecycle: 'COMPLETE',     timestamp: '2024-01-01T02:00:00.000Z', node_id: 'task1', paths: {t1: ['task1']}},
            {case_id: 1, lifecycle: 'CASE_END',     timestamp: '2024-01-01T03:00:00.000Z', node_id: 'end',   paths: {}},
            {case_id: 2, lifecycle: 'CASE_ARRIVAL', timestamp: '2024-01-01T00:30:00.000Z', node_id: 'start', paths: {}},
            {case_id: 2, lifecycle: 'CASE_END',     timestamp: '2024-01-01T04:00:00.000Z', node_id: 'end',   paths: {}},
        ];
        const pyFrames = [
            {case_id: 1, active_elements: {t1: 'task1'}},
            {case_id: 2, active_elements: {t1: 'start'}},
        ];

        (axios.post as jest.Mock).mockResolvedValue({data: {events: pyEvents, frames: pyFrames}});

        const formData = new FormData();
        formData.append('id', PROCESS_ID);
        formData.append(
            'bpmnFile',
            new File([new Blob(['<definitions/>'])], 'model.bpmn', {type: 'application/xml'})
        );
        formData.append('logFile', new File([''], 'log.csv'));
        formData.append('jsonFile', new File(['{}'], 'params.json'));
        formData.append('config', JSON.stringify({
            startingPoint: '2024-01-01T00:00:00',
            simulationHorizonValue: 1,
            simulationHorizonUnit: 'days',
        }));
        formData.append('mapping', JSON.stringify({case: 'case_id'}));

        const request = new Request('http://localhost/api/simulation', {method: 'POST', body: formData});
        const response = await POST(request);

        expect(response.status).toBe(201);
        expect(response.body).toEqual({id: PROCESS_ID});

        // MySQL: one Process row with correct dates
        const processes = await db.dataSource.query(
            'SELECT id, fileName FROM process WHERE id = ?', [PROCESS_ID]
        );
        expect(processes).toHaveLength(1);
        expect(processes[0].fileName).toContain('model.bpmn');

        // MySQL: all 6 events stored
        const events = await db.dataSource.query(
            'SELECT lifecycle FROM event WHERE processId = ? ORDER BY timestamp', [PROCESS_ID]
        );
        expect(events).toHaveLength(6);

        // MySQL: both frames stored
        const frames = await db.dataSource.query(
            'SELECT caseId FROM frame WHERE processId = ?', [PROCESS_ID]
        );
        expect(frames).toHaveLength(2);

        // Redis: frames cached under the correct key
        const cached = await redisTest.client.get(`frames:${PROCESS_ID}`);
        expect(cached).not.toBeNull();
        const parsed = JSON.parse(cached!);
        expect(parsed).toHaveLength(2);
    });

    it('returns 400 when bpmnFile is missing', async () => {
        const formData = new FormData();
        formData.append('id', PROCESS_ID);

        const request = new Request('http://localhost/api/simulation', {method: 'POST', body: formData});
        const response = await POST(request);

        expect(response.status).toBe(400);
    });

    it('returns 500 when the Python microservice is unavailable', async () => {
        (axios.post as jest.Mock).mockRejectedValue(new Error('ECONNREFUSED'));

        const formData = new FormData();
        formData.append('id', PROCESS_ID);
        formData.append(
            'bpmnFile',
            new File([new Blob(['<definitions/>'])], 'model.bpmn')
        );
        formData.append('logFile', new File([''], 'log.csv'));
        formData.append('jsonFile', new File(['{}'], 'params.json'));
        formData.append('config', JSON.stringify({
            startingPoint: '2024-01-01T00:00:00',
            simulationHorizonValue: 1,
            simulationHorizonUnit: 'days',
        }));
        formData.append('mapping', JSON.stringify({case: 'case_id'}));

        const request = new Request('http://localhost/api/simulation', {method: 'POST', body: formData});
        const response = await POST(request);

        expect(response.status).toBe(500);

        // No rows should have been written
        const processes = await db.dataSource.query(
            'SELECT id FROM process WHERE id = ?', [PROCESS_ID]
        );
        expect(processes).toHaveLength(0);
    });
});
