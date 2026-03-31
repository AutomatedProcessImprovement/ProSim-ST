import {mockJsonResponse, createQueryBuilderMock} from "../../testHelpers";
import {makeEvent} from "@utils/testHelpers";
import {LifecycleTypes} from "@definitions/simulation/enums";

jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((body, init) => mockJsonResponse(body, init)),
    },
}));

jest.mock("@db/mysql/typeorm", () => ({
    createMySQLConnection: jest.fn(),
}));

jest.mock("@db/redis/redis", () => ({
    getRedisInstance: jest.fn(),
    REDIS_KEY_PREFIX_FRAMES: "frames:",
}));

jest.mock("@utils/events", () => ({
    groupEvents: jest.fn(),
}));

jest.mock("fs/promises", () => ({
    readFile: jest.fn(),
}));

import {GET} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {getRedisInstance} from "@db/redis/redis";
import {groupEvents} from "@utils/events";
import {readFile} from "fs/promises";
import {Process} from "@db/entities/Process";
import {Frame} from "@db/entities/Frame";

describe("GET /api/simulation/[id]", () => {
    const processRepository = {
        createQueryBuilder: jest.fn(),
        update: jest.fn(),
    };
    const redis = {
        get: jest.fn(),
        set: jest.fn(),
        disconnect: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getRedisInstance as jest.Mock).mockReturnValue(redis);
    });

    it("returns 404 when the process is missing", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(null));
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn(() => processRepository),
        });

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Process not found"}, status: 404});
    });

    it("returns 410 when the process is marked for deletion", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            fileName: "model.bpmn",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-01 03:00:00",
            setToDelete: true,
        }));
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn(() => processRepository),
        });

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Process is marked for deletion"}, status: 410});
    });

    it("loads frames from DB on cache miss and returns simulation data", async () => {
        const frameRepo = {
            createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock([
                {caseId: 1, activeElements: {token: "Task_1"}},
            ])),
        };
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            fileName: "model.bpmn",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-01 20:00:00",
            setToDelete: false,
        }));
        (groupEvents as jest.Mock).mockReturnValue([{events: [], startDate: "a", endDate: "b"}]);
        (readFile as jest.Mock).mockResolvedValue(Buffer.from("xml"));
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepository;
                if (entity === Frame) return frameRepo;
                throw new Error("unexpected repository");
            }),
            query: jest.fn().mockResolvedValue([
                makeEvent({
                    caseId: 1,
                    lifecycle: LifecycleTypes.START,
                    timestamp: "2024-01-01 00:30:00",
                    nodeId: "Task_1",
                    paths: {token: ["Flow_1", "Task_1"]},
                }),
            ]),
        });
        redis.get.mockResolvedValueOnce(null);

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(processRepository.update).toHaveBeenCalled();
        expect(redis.set).toHaveBeenCalledWith(
            "frames:p1",
            JSON.stringify([{caseId: 1, activeElements: {token: "Task_1"}}]),
            "EX",
            60 * 60 * 24,
        );
        expect(response).toEqual({
            body: {
                processId: "p1",
                batches: [{events: [], startDate: "a", endDate: "b"}],
                frames: [{caseId: 1, activeElements: {token: "Task_1"}}],
                file: Buffer.from("xml"),
                startDate: "2024-01-01 00:00:00",
                endDate: "2024-01-01 20:00:00",
                pointer: 15,
            },
            status: 200,
        });
    });

    it("uses cached frames and marks pointer -1 when the initial window finishes the simulation", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            fileName: "model.bpmn",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-01 02:00:00",
            setToDelete: false,
        }));
        (groupEvents as jest.Mock).mockReturnValue([]);
        (readFile as jest.Mock).mockResolvedValue(Buffer.from("xml"));
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepository;
                throw new Error("unexpected repository");
            }),
            query: jest.fn().mockResolvedValue([]),
        });
        redis.get.mockResolvedValueOnce(JSON.stringify([{caseId: 2, activeElements: {token: "Task_2"}}]));

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(redis.set).not.toHaveBeenCalled();
        expect(response).toEqual({
            body: {
                processId: "p1",
                batches: [],
                frames: [{caseId: 2, activeElements: {token: "Task_2"}}],
                file: Buffer.from("xml"),
                startDate: "2024-01-01 00:00:00",
                endDate: "2024-01-01 02:00:00",
                pointer: -1,
            },
            status: 200,
        });
    });

    it("returns 500 when reading the simulation data fails", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        processRepository.createQueryBuilder.mockImplementation(() => {
            throw new Error("db failed");
        });
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn(() => processRepository),
        });

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Failed to get simulation data."}, status: 500});
        logSpy.mockRestore();
    });
});


