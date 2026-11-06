jest.mock('next/server', () => ({
    NextResponse: {
        json: (body: unknown, init?: {status?: number}) => ({body, status: init?.status ?? 200}),
    },
}));

jest.mock('fs/promises', () => {
    const real = jest.requireActual<typeof import('fs/promises')>('fs/promises');
    return {
        ...real,
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

import axios from 'axios';
import {GET as getSimulation} from '../app/api/simulation/[id]/route';
import {GET as getComparison} from '../app/api/simulation/[id]/comparison/route';
import {createMySQLConnection} from '@db/mysql/typeorm';
import {getRedisInstance} from '@db/redis/redis';
import {saveSimulation} from '@db/mysql/simulationStore';
import {cleanupOldProcesses} from '@db/cleanup';
import {Scenario} from '@db/entities/Scenario';
import {createJob, getJob} from '@utils/simulationJobs';
import {Comparison, ScenarioEdits} from '@definitions/api/types';
import {LifecycleTypes} from '../definitions/simulation/enums';
import {startTestDb, stopTestDb, clearTables, TestDb} from './helpers/db';
import {startTestRedis, stopTestRedis, makeRedisFactory, TestRedis} from './helpers/redis';
import {seedProcess} from './helpers/fixtures';

const BASE = new Date('2024-01-01T00:00:00.000Z');
const END = new Date('2024-01-02T00:00:00.000Z');
const edits: ScenarioEdits = {pools: {clerks: 4}, arrivalPercent: 10, tasks: {}};
const comparison = {repeats: {seeds: 9}, asIs: {finished: 3}, toBe: {finished: 5}} as unknown as Comparison;

const makeContext = (id: string) => ({params: Promise.resolve({id})});
const request = {url: 'http://test/'} as Request;

describe('what-if runs (integration)', () => {
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

    const seedRun = async () => {
        await seedProcess(db.dataSource, {
            id: 'as-is', fileName: 'as-is_model.bpmn', startDate: '2024-01-01 00:00:00', endDate: '2024-01-02 00:00:00',
        });
        createJob('to-be');
        await saveSimulation({
            id: 'to-be',
            window: {startDate: BASE, endDate: END, utcOffset: '+02:00'},
            data: {
                frames: [{caseId: 1, activeElements: {token_0: 'Task_1'}}],
                events: [{
                    caseId: 1,
                    lifecycle: LifecycleTypes.START,
                    timestamp: '2024-01-01T05:00:00.000Z',
                    nodeId: 'Task_1',
                    paths: {},
                }],
            },
        }, '/assets/to-be_model.bpmn', {baseProcessId: 'as-is', label: 'Clerk 3 → 4 · Arrivals +10%', edits, comparison});
    };

    it('stores a to-be as a normal run, linked to its as-is', async () => {
        await seedRun();

        expect(getJob('to-be')?.stage).toBe('done');
        const response = await getSimulation(request, makeContext('to-be'));

        expect(response.status).toBe(200);
        expect((response.body as unknown as {scenario: unknown}).scenario).toEqual({
            baseProcessId: 'as-is', label: 'Clerk 3 → 4 · Arrivals +10%', edits,
        });
    });

    it('leaves an ordinary run without a link', async () => {
        await seedRun();

        const response = await getSimulation(request, makeContext('as-is'));

        expect((response.body as unknown as {scenario: unknown}).scenario).toBeNull();
    });

    it('serves the comparison and renews both runs', async () => {
        await seedRun();
        await db.dataSource.query(`UPDATE process SET lastAccessedAt = '2020-01-01 00:00:00'`);

        const response = await getComparison(request, makeContext('to-be'));

        expect(response.body).toMatchObject({baseProcessId: 'as-is', edits, comparison, utcOffset: '+02:00'});
        const stale = await db.dataSource.query(`SELECT id FROM process WHERE lastAccessedAt < '2021-01-01'`);
        expect(stale).toEqual([]);
    });

    it('keeps a to-be when its as-is expires, and removes the link when the to-be expires', async () => {
        await seedRun();
        const pythonDelete = jest.spyOn(axios, 'delete').mockResolvedValue({});
        const pythonPrune = jest.spyOn(axios, 'post').mockResolvedValue({data: {removed: []}});
        const options = {retentionDays: 30, pythonBaseUrl: 'http://python', assetsDir: '/nonexistent'};

        await db.dataSource.query(`UPDATE process SET setToDelete = 1 WHERE id = 'as-is'`);
        expect((await cleanupOldProcesses(db.dataSource, options)).deleted).toEqual(['as-is']);
        expect(await db.dataSource.getRepository(Scenario).count()).toBe(1);

        await db.dataSource.query(`UPDATE process SET setToDelete = 1 WHERE id = 'to-be'`);
        expect((await cleanupOldProcesses(db.dataSource, options)).deleted).toEqual(['to-be']);
        expect(await db.dataSource.getRepository(Scenario).count()).toBe(0);
        pythonDelete.mockRestore();
        pythonPrune.mockRestore();
    });
});
