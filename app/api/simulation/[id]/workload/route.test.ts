import {mockJsonResponse, createQueryBuilderMock} from "../../../testHelpers";
import {makeEventWith} from "@utils/testHelpers";
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
    REDIS_KEY_PREFIX_WORKLOAD: "workload:",
}));

jest.mock("@utils/workload", () => ({
    buildWorkloadSeries: jest.fn(),
}));

import {GET} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {getRedisInstance} from "@db/redis/redis";
import {buildWorkloadSeries} from "@utils/workload";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {Frame} from "@db/entities/Frame";

describe("GET /api/simulation/[id]/workload", () => {
    const redis = {
        get: jest.fn(),
        set: jest.fn(),
        disconnect: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getRedisInstance as jest.Mock).mockReturnValue(redis);
    });

    it("returns cached workload data when present", async () => {
        redis.get.mockResolvedValueOnce(JSON.stringify([3, 2, 1]));

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: [3, 2, 1], status: 200});
        expect(createMySQLConnection).not.toHaveBeenCalled();
    });

    it("uses cached frames when workload must be computed", async () => {
        const processRepo = {
            findOneBy: jest.fn().mockResolvedValue({
                id: "p1",
                startDate: "2024-01-01 00:00:00",
                endDate: "2024-01-01 02:00:00",
            }),
        };
        const eventRepo = {
            createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock([
                makeEventWith(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T00:00:00.000Z"),
                makeEventWith(1, LifecycleTypes.CASE_END, "2024-01-01T01:00:00.000Z"),
            ])),
        };
        const frameRepo = {
            find: jest.fn(),
        };
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepo;
                if (entity === Event) return eventRepo;
                if (entity === Frame) return frameRepo;
                throw new Error("unexpected repository");
            }),
        });
        redis.get
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(JSON.stringify([{caseId: 7, activeElements: {a: "Task_1"}}]));
        (buildWorkloadSeries as jest.Mock).mockReturnValue([5, 6]);

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(buildWorkloadSeries).toHaveBeenCalledWith(
            expect.any(Array),
            [{caseId: 7, activeElements: {a: "Task_1"}}],
            "2024-01-01 00:00:00",
            "2024-01-01 02:00:00",
        );
        expect(frameRepo.find).not.toHaveBeenCalled();
        expect(redis.set).toHaveBeenCalledWith("workload:p1", JSON.stringify([5, 6]), "EX", 60 * 60 * 24);
        expect(response).toEqual({body: [5, 6], status: 200});
    });

    it("loads frames from the repository when the frame cache is empty", async () => {
        const processRepo = {
            findOneBy: jest.fn().mockResolvedValue({
                id: "p1",
                startDate: "2024-01-01 00:00:00",
                endDate: "2024-01-01 02:00:00",
            }),
        };
        const eventRepo = {
            createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock([])),
        };
        const frameRepo = {
            find: jest.fn().mockResolvedValue([{caseId: 1, activeElements: {token: "Task_2"}}]),
        };
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepo;
                if (entity === Event) return eventRepo;
                if (entity === Frame) return frameRepo;
                throw new Error("unexpected repository");
            }),
        });
        redis.get.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
        (buildWorkloadSeries as jest.Mock).mockReturnValue([1]);

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(frameRepo.find).toHaveBeenCalledWith({where: {processId: "p1"}});
        expect(response).toEqual({body: [1], status: 200});
    });

    it("returns 404 when the process is missing", async () => {
        const processRepo = {
            findOneBy: jest.fn().mockResolvedValue(null),
        };
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn(() => processRepo),
        });
        redis.get.mockResolvedValueOnce(null);

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({
            body: {error: "Process not found or missing start/end dates"},
            status: 404,
        });
    });

    it("returns 500 when workload computation fails unexpectedly", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        redis.get.mockResolvedValueOnce(null);
        (createMySQLConnection as jest.Mock).mockRejectedValue(new Error("db down"));

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Failed to get workload data."}, status: 500});
        errorSpy.mockRestore();
    });
});



