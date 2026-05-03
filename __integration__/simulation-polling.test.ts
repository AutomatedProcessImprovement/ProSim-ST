/**
 * Integration test: GET /api/simulation/[id]/polling
 *
 * Verifies incremental batch loading: correct events per window, pointer
 * arithmetic, and the -1 sentinel when the simulation is exhausted.
 */

jest.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: {status?: number}) => ({body, status: init?.status ?? 200}),
    },
}));

jest.mock('@db/mysql/typeorm', () => ({createMySQLConnection: jest.fn()}));

jest.mock('@db/redis/redis', () => ({
    getRedisInstance: jest.fn(),
    REDIS_KEY_PREFIX_FRAMES: 'frames:',
    REDIS_KEY_PREFIX_WORKLOAD: 'workload:',
    REDIS_KEY_PREFIX_CYCLE_TIME: 'cycle-time:',
}));

import {GET} from '../app/api/simulation/[id]/polling/route';
import {createMySQLConnection} from '@db/mysql/typeorm';
import {startTestDb, stopTestDb, clearTables, TestDb} from './helpers/db';
import {startTestRedis, stopTestRedis, TestRedis} from './helpers/redis';
import {seedProcess, seedEvents, ts} from './helpers/fixtures';
import {LifecycleTypes} from '../definitions/simulation/enums';

const BASE = new Date('2024-01-01T00:00:00.000Z');
const PROCESS_ID = 'integ-poll-001';

const makeContext = (id: string) => ({params: Promise.resolve({id})});
const makeRequest = (url: string) => ({url} as Request);

describe('GET /api/simulation/[id]/polling (integration)', () => {
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
        const response = await GET(
            makeRequest('http://localhost?pointer=0&limit=10'),
            makeContext('unknown-id')
        );
        expect(response.status).toBe(404);
    });

    it('returns correct batch window and increments pointer', async () => {
        // Simulation spans 40 hours; seed one arrival event per 10 hours
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 40),
        });
        await seedEvents(db.dataSource, [
            {caseId: 1, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 0),  nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 2, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 10), nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 3, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 20), nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 4, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 30), nodeId: 'start', paths: {}, processId: PROCESS_ID},
        ]);

        // First poll: pointer=15 (after the 15-hour initial load), limit=10
        const r1 = await GET(
            makeRequest('http://localhost?pointer=15&limit=10'),
            makeContext(PROCESS_ID)
        );
        expect(r1.status).toBe(200);
        const d1 = r1.body as any;
        expect(d1.pointer).toBe(25);
        // Only the event at hour 20 falls in the [15h, 25h) window
        const events1 = d1.batches.flatMap((b: any) => b.events);
        expect(events1).toHaveLength(1);
        expect(events1[0].caseId).toBe(3);

        // Second poll: pointer=25, limit=10
        const r2 = await GET(
            makeRequest('http://localhost?pointer=25&limit=10'),
            makeContext(PROCESS_ID)
        );
        expect(r2.status).toBe(200);
        const d2 = r2.body as any;
        expect(d2.pointer).toBe(35);
        const events2 = d2.batches.flatMap((b: any) => b.events);
        expect(events2).toHaveLength(1);
        expect(events2[0].caseId).toBe(4);
    });

    it('returns pointer -1 when the pointer advances past the simulation end', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 10),
        });

        const response = await GET(
            makeRequest('http://localhost?pointer=15&limit=10'),
            makeContext(PROCESS_ID)
        );
        expect(response.status).toBe(200);
        expect((response.body as any).pointer).toBe(-1);
        expect((response.body as any).batches).toEqual([]);
    });

    it('returns pointer -1 on the last batch when window reaches the simulation end exactly', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 30),
        });
        await seedEvents(db.dataSource, [
            {caseId: 1, lifecycle: LifecycleTypes.CASE_END, timestamp: ts(BASE, 29), nodeId: 'end', paths: {}, processId: PROCESS_ID},
        ]);

        // Request window [20h, 30h] — covers the end of the simulation
        const response = await GET(
            makeRequest('http://localhost?pointer=20&limit=10'),
            makeContext(PROCESS_ID)
        );
        expect(response.status).toBe(200);
        expect((response.body as any).pointer).toBe(-1);
        const events = (response.body as any).batches.flatMap((b: any) => b.events);
        expect(events).toHaveLength(1);
    });

    it('updates lastAccessedAt on each poll', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 20),
        });

        const before = new Date();
        await GET(makeRequest('http://localhost?pointer=0&limit=5'), makeContext(PROCESS_ID));
        const rows = await db.dataSource.query(
            'SELECT lastAccessedAt FROM process WHERE id = ?', [PROCESS_ID]
        );
        const accessedAt = new Date(rows[0].lastAccessedAt);
        expect(accessedAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    });
});
