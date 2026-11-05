jest.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: {status?: number}) => ({body, status: init?.status ?? 200}),
    },
}));

jest.mock('axios', () => ({default: {post: jest.fn()}, post: jest.fn()}));

jest.mock('@db/mysql/typeorm', () => ({createMySQLConnection: jest.fn()}));

jest.mock('@db/redis/redis', () => ({
    getRedisInstance: jest.fn(),
    REDIS_KEY_PREFIX_FRAMES: 'frames:',
    REDIS_KEY_PREFIX_WORKLOAD: 'workload:',
    REDIS_KEY_PREFIX_CYCLE_TIME: 'cycle-time:',
}));

import {POST} from '../app/api/simulation/[id]/resumption/route';
import {createMySQLConnection} from '@db/mysql/typeorm';
import axios from 'axios';
import {startTestDb, stopTestDb, clearTables, TestDb} from './helpers/db';
import {startTestRedis, stopTestRedis, TestRedis} from './helpers/redis';
import {seedProcess, seedEvents, ts} from './helpers/fixtures';
import {LifecycleTypes} from '../definitions/simulation/enums';

const BASE = new Date('2024-01-01T00:00:00.000Z');
const PROCESS_ID = 'integ-resumption-001';

const makeContext = (id: string) => ({params: Promise.resolve({id})});

const makeRequest = (body: object) =>
    ({json: () => Promise.resolve(body)} as unknown as Request);

describe('POST /api/simulation/[id]/resumption (integration)', () => {
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
    });

    it('returns 404 for an unknown process', async () => {
        (axios.post as jest.Mock).mockResolvedValue({data: {frames: []}});

        const response = await POST(
            makeRequest({requestedDate: ts(BASE, 5)}),
            makeContext('unknown-id')
        );
        expect(response.status).toBe(404);
    });

    it('counts finished cases correctly up to the requested timestamp', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 20),
        });
        await seedEvents(db.dataSource, [
            {caseId: 1, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 0),  nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 1, lifecycle: LifecycleTypes.CASE_END,     timestamp: ts(BASE, 3),  nodeId: 'end',   paths: {}, processId: PROCESS_ID},
            {caseId: 2, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 2),  nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 2, lifecycle: LifecycleTypes.CASE_END,     timestamp: ts(BASE, 8),  nodeId: 'end',   paths: {}, processId: PROCESS_ID},
            {caseId: 3, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 4),  nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 3, lifecycle: LifecycleTypes.CASE_END,     timestamp: ts(BASE, 12), nodeId: 'end',   paths: {}, processId: PROCESS_ID},
        ]);

        (axios.post as jest.Mock).mockResolvedValue({data: {frames: []}});

        const requestedDate = new Date(BASE.getTime() + 9 * 3_600_000);
        const response = await POST(
            makeRequest({requestedDate: requestedDate.toISOString()}),
            makeContext(PROCESS_ID)
        );

        expect(response.status).toBe(200);
        expect((response.body as any).finishedCasesNumber).toBe(2);
    });

    it('builds WTPT metrics from events up to the requested timestamp', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 10),
        });
        await seedEvents(db.dataSource, [
            {caseId: 1, lifecycle: LifecycleTypes.ENABLE,   timestamp: ts(BASE, 1), nodeId: 'task1', paths: {t1: ['task1']}, processId: PROCESS_ID},
            {caseId: 1, lifecycle: LifecycleTypes.START,    timestamp: ts(BASE, 2), nodeId: 'task1', paths: {t1: ['task1']}, processId: PROCESS_ID},
            {caseId: 1, lifecycle: LifecycleTypes.COMPLETE, timestamp: ts(BASE, 3), nodeId: 'task1', paths: {t1: ['task1']}, processId: PROCESS_ID},
        ]);

        (axios.post as jest.Mock).mockResolvedValue({data: {frames: []}});

        const requestedDate = new Date(BASE.getTime() + 5 * 3_600_000);
        const response = await POST(
            makeRequest({requestedDate: requestedDate.toISOString()}),
            makeContext(PROCESS_ID)
        );

        expect(response.status).toBe(200);
        const wtpt = (response.body as any).wtpt as Record<string, any>;
        expect(wtpt).toHaveProperty('task1');
        const oneHourMs = 60 * 60 * 1000;
        expect(wtpt['task1'].averageWT).toBeCloseTo(oneHourMs, -5);
        expect(wtpt['task1'].averagePT).toBeCloseTo(oneHourMs, -5);
    });

    it('repairs token IDs in returned frames using pre-computed event paths', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 10),
        });
        await seedEvents(db.dataSource, [
            {
                caseId: 1,
                lifecycle: LifecycleTypes.START,
                timestamp: ts(BASE, 1),
                nodeId: 'task1',
                paths: {'real-t1': ['task1']},
                processId: PROCESS_ID,
            },
        ]);

        (axios.post as jest.Mock).mockResolvedValue({
            data: {
                frames: [
                    {case_id: 1, active_elements: {'py-t1': 'task1'}},
                ],
            },
        });

        const requestedDate = new Date(BASE.getTime() + 5 * 3_600_000);
        const response = await POST(
            makeRequest({requestedDate: requestedDate.toISOString()}),
            makeContext(PROCESS_ID)
        );

        expect(response.status).toBe(200);
        const frames = (response.body as any).frames as any[];
        expect(frames).toHaveLength(1);
        expect(frames[0].activeElements).toHaveProperty('real-t1', 'task1');
        expect(frames[0].activeElements).not.toHaveProperty('py-t1');
    });

    it('returns pointer -1 and empty batches when the requested date is past the simulation end', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 5),
        });

        (axios.post as jest.Mock).mockResolvedValue({data: {frames: []}});

        const pastDate = new Date(BASE.getTime() + 10 * 3_600_000);
        const response = await POST(
            makeRequest({requestedDate: pastDate.toISOString()}),
            makeContext(PROCESS_ID)
        );

        expect(response.status).toBe(200);
        expect((response.body as any).pointer).toBe(-1);
        expect((response.body as any).batches).toEqual([]);
        expect((response.body as any).frames).toEqual([]);
    });
});
