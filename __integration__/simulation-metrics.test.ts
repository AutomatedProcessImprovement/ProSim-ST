/**
 * Integration test: GET /api/simulation/[id]/workload
 *                   GET /api/simulation/[id]/cycle-time
 *
 * Verifies that metrics are computed from real MySQL data,
 * cached to Redis on first load, and served from cache on subsequent loads.
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

import {GET as getWorkload} from '../app/api/simulation/[id]/workload/route';
import {GET as getCycleTime} from '../app/api/simulation/[id]/cycle-time/route';
import {createMySQLConnection} from '@db/mysql/typeorm';
import {getRedisInstance} from '@db/redis/redis';
import {startTestDb, stopTestDb, clearTables, TestDb} from './helpers/db';
import {startTestRedis, stopTestRedis, makeRedisFactory, TestRedis} from './helpers/redis';
import {seedProcess, seedEvents, seedFrames, ts} from './helpers/fixtures';
import {LifecycleTypes} from '../definitions/simulation/enums';

const BASE = new Date('2024-01-01T00:00:00.000Z');
const PROCESS_ID = 'integ-metrics-001';

const makeContext = (id: string) => ({params: Promise.resolve({id})});
const makeRequest = (url: string) => ({url} as Request);

describe('GET /api/simulation/[id]/workload (integration)', () => {
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
        const response = await getWorkload(makeRequest('http://localhost'), makeContext('unknown-id'));
        expect(response.status).toBe(404);
    });

    it('computes a 1000-point workload series from CASE_ARRIVAL and CASE_END events', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 4),
        });
        // Case 1: active from hour 0 to hour 2
        // Case 2: active from hour 1 to hour 3
        await seedEvents(db.dataSource, [
            {caseId: 1, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 0), nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 2, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 1), nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 1, lifecycle: LifecycleTypes.CASE_END,     timestamp: ts(BASE, 2), nodeId: 'end',   paths: {}, processId: PROCESS_ID},
            {caseId: 2, lifecycle: LifecycleTypes.CASE_END,     timestamp: ts(BASE, 3), nodeId: 'end',   paths: {}, processId: PROCESS_ID},
        ]);
        await seedFrames(db.dataSource, [
            {caseId: 1, activeElements: {}, processId: PROCESS_ID},
            {caseId: 2, activeElements: {}, processId: PROCESS_ID},
        ]);

        const response = await getWorkload(makeRequest('http://localhost'), makeContext(PROCESS_ID));
        expect(response.status).toBe(200);

        const series = (response as any).body as number[];
        expect(series).toHaveLength(1000);

        // At the start, 1 case is active; at 25% (hour 1), 2 cases active; at 50% (hour 2), 1 active; at 75% (hour 3), 0
        expect(series[0]).toBe(1);        // hour 0: case 1 arrived
        const quarterIdx = 250;
        expect(series[quarterIdx]).toBe(2); // ~hour 1: case 2 arrived
        const halfIdx = 500;
        expect(series[halfIdx]).toBe(1);    // ~hour 2: case 1 ended
        const threeQuarterIdx = 750;
        expect(series[threeQuarterIdx]).toBe(0); // ~hour 3: case 2 ended
    });

    it('caches the workload series in Redis and serves it on repeated calls', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 2),
        });
        await seedEvents(db.dataSource, [
            {caseId: 1, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 0), nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 1, lifecycle: LifecycleTypes.CASE_END,     timestamp: ts(BASE, 2), nodeId: 'end',   paths: {}, processId: PROCESS_ID},
        ]);
        await seedFrames(db.dataSource, [{caseId: 1, activeElements: {}, processId: PROCESS_ID}]);

        // First call computes and caches
        const r1 = await getWorkload(makeRequest('http://localhost'), makeContext(PROCESS_ID));
        expect(r1.status).toBe(200);

        const cached = await redisTest.client.get(`workload:${PROCESS_ID}`);
        expect(cached).not.toBeNull();
        const cachedSeries = JSON.parse(cached!);
        expect(cachedSeries).toHaveLength(1000);

        // Second call — return value from Redis (we poison the DB to confirm cache is used)
        await db.dataSource.query('DELETE FROM event WHERE processId = ?', [PROCESS_ID]);
        const r2 = await getWorkload(makeRequest('http://localhost'), makeContext(PROCESS_ID));
        expect(r2.status).toBe(200);
        expect(r2.body).toEqual(cachedSeries);
    });
});

describe('GET /api/simulation/[id]/cycle-time (integration)', () => {
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

    it('computes a 100-point cycle-time series reflecting completed cases', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 4),
        });
        // Case 1 cycle time = 2 hours; Case 2 cycle time = 2 hours as well
        await seedEvents(db.dataSource, [
            {caseId: 1, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 0), nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 1, lifecycle: LifecycleTypes.CASE_END,     timestamp: ts(BASE, 2), nodeId: 'end',   paths: {}, processId: PROCESS_ID},
            {caseId: 2, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 1), nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 2, lifecycle: LifecycleTypes.CASE_END,     timestamp: ts(BASE, 3), nodeId: 'end',   paths: {}, processId: PROCESS_ID},
        ]);

        const response = await getCycleTime(makeRequest('http://localhost'), makeContext(PROCESS_ID));
        expect(response.status).toBe(200);

        const series = (response as any).body as number[];
        expect(series).toHaveLength(100);

        // First sample (point 0) — no cases finished yet: 0
        expect(series[0]).toBe(0);

        // After hour 2 (50th percentile), case 1 is done: avg CT = 2h in ms
        const twoHoursMs = 2 * 60 * 60 * 1000;
        const midIdx = 50;
        expect(series[midIdx]).toBeCloseTo(twoHoursMs, -5);

        // Final sample: both cases done, avg remains 2h in ms
        expect(series[99]).toBeCloseTo(twoHoursMs, -5);
    });

    it('caches the cycle-time series in Redis', async () => {
        await seedProcess(db.dataSource, {
            id: PROCESS_ID,
            startDate: ts(BASE, 0),
            endDate: ts(BASE, 2),
        });
        await seedEvents(db.dataSource, [
            {caseId: 1, lifecycle: LifecycleTypes.CASE_ARRIVAL, timestamp: ts(BASE, 0), nodeId: 'start', paths: {}, processId: PROCESS_ID},
            {caseId: 1, lifecycle: LifecycleTypes.CASE_END,     timestamp: ts(BASE, 2), nodeId: 'end',   paths: {}, processId: PROCESS_ID},
        ]);

        await getCycleTime(makeRequest('http://localhost'), makeContext(PROCESS_ID));

        const cached = await redisTest.client.get(`cycle-time:${PROCESS_ID}`);
        expect(cached).not.toBeNull();
        expect(JSON.parse(cached!)).toHaveLength(100);
    });
});
