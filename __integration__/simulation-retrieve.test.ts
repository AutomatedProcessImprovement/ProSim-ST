/**
 * Integration test: GET /api/simulation/[id]
 *
 * Verifies the initial data retrieval: event grouping into hourly batches,
 * Redis cache population on first load, cache hit on subsequent loads,
 * and correct 404/410 error responses.
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
        // Return dummy BPMN for public/assets reads; delegate everything else (incl. Docker config) to the real fs
        readFile: jest.fn((path: string, ...args: unknown[]) => {
            if (typeof path === 'string' && path.includes('public/assets')) {
                return Promise.resolve(Buffer.from('<definitions/>'));
            }
            return real.readFile(path as never, ...(args as never[]));
        }),
    };
});

jest.mock('@db/mysql/typeorm', () => ({createMySQLConnection: jest.fn()}));

jest.mock('@db/redis/redis', () => ({
    getRedisInstance: jest.fn(),
    REDIS_KEY_PREFIX_FRAMES: 'frames:',
    REDIS_KEY_PREFIX_WORKLOAD: 'workload:',
    REDIS_KEY_PREFIX_CYCLE_TIME: 'cycle-time:',
}));

import {GET} from '../app/api/simulation/[id]/route';
import {createMySQLConnection} from '@db/mysql/typeorm';
import {getRedisInstance} from '@db/redis/redis';
import {startTestDb, stopTestDb, clearTables, TestDb} from './helpers/db';
import {startTestRedis, stopTestRedis, makeRedisFactory, TestRedis} from './helpers/redis';
import {seedProcess, seedEvents, seedFrames, ts} from './helpers/fixtures';
import {LifecycleTypes} from '../definitions/simulation/enums';

const BASE = new Date('2024-01-01T00:00:00.000Z');
const PROCESS_ID = 'integ-retrieve-001';

const makeContext = (id: string) => ({params: Promise.resolve({id})});
const makeRequest = (url: string) => ({url} as Request);

describe('GET /api/simulation/[id] (integration)', () => {
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

    it('returns 404 for an unknown process', async () => {
        const response = await GET(makeRequest('http://localhost'), makeContext('unknown-id'));
        expect(response.status).toBe(404);
    });

    it('returns 410 for a process marked for deletion', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 5),
            setToDelete: true,
        });

        const response = await GET(makeRequest('http://localhost'), makeContext(PROCESS_ID));
        expect(response.status).toBe(410);
    });

    it('groups events into hourly batches and returns the initial 15-hour window', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 20),
        });

        // Seed events spread over 20 hours: one arrival per hour for 4 cases
        const events = Array.from({length: 4}, (_, i) => ({
            caseId: i + 1,
            lifecycle: LifecycleTypes.CASE_ARRIVAL,
            timestamp: ts(BASE, i * 5),
            nodeId: 'start',
            paths: {},
            processId: PROCESS_ID,
        }));
        await seedEvents(db.dataSource, events);
        await seedFrames(db.dataSource, [{caseId: 1, activeElements: {t1: 'start'}, processId: PROCESS_ID}]);

        const response = await GET(makeRequest('http://localhost'), makeContext(PROCESS_ID));

        expect(response.status).toBe(200);
        const data = response.body as any;
        expect(data.processId).toBe(PROCESS_ID);
        expect(Array.isArray(data.batches)).toBe(true);
        // 15-hour window from hour 0 → only the first 3 arrivals (hours 0, 5, 10) are in range
        const allEvents = (data.batches as any[]).flatMap((b: any) => b.events);
        expect(allEvents.length).toBe(3);
        expect(data.pointer).toBe(15);
    });

    it('populates the Redis frame cache on first load and serves it on second load', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 3),
        });
        await seedFrames(db.dataSource, [
            {caseId: 1, activeElements: {t1: 'task1'}, processId: PROCESS_ID},
            {caseId: 2, activeElements: {t2: 'task2'}, processId: PROCESS_ID},
        ]);

        // First load — cache miss, should populate Redis
        const r1 = await GET(makeRequest('http://localhost'), makeContext(PROCESS_ID));
        expect(r1.status).toBe(200);
        const cached = await redisTest.client.get(`frames:${PROCESS_ID}`);
        expect(cached).not.toBeNull();
        const cachedFrames = JSON.parse(cached!);
        expect(cachedFrames).toHaveLength(2);

        // Delete frames from MySQL to confirm the second load comes from Redis
        await db.dataSource.query('DELETE FROM frame WHERE processId = ?', [PROCESS_ID]);

        const r2 = await GET(makeRequest('http://localhost'), makeContext(PROCESS_ID));
        expect(r2.status).toBe(200);
        const d2 = r2.body as any;
        expect(d2.frames).toHaveLength(2);
    });

    it('returns pointer -1 when the full simulation fits within the 15-hour window', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 3),
        });

        const response = await GET(makeRequest('http://localhost'), makeContext(PROCESS_ID));
        expect(response.status).toBe(200);
        expect((response.body as any).pointer).toBe(-1);
    });
});
