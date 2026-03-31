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
    REDIS_KEY_PREFIX_CYCLE_TIME: "cycle-time:",
}));

jest.mock("@utils/cycleTime", () => ({
    buildCycleTimeSeries: jest.fn(),
}));

import {GET} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {getRedisInstance} from "@db/redis/redis";
import {buildCycleTimeSeries} from "@utils/cycleTime";
import {NextResponse} from "next/server";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";

describe("GET /api/simulation/[id]/cycle-time", () => {
    const redis = {
        get: jest.fn(),
        set: jest.fn(),
        disconnect: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getRedisInstance as jest.Mock).mockReturnValue(redis);
    });

    it("returns cached cycle-time data when present", async () => {
        redis.get.mockResolvedValueOnce(JSON.stringify([1, 2, 3]));

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: [1, 2, 3], status: 200});
        expect(createMySQLConnection).not.toHaveBeenCalled();
        expect(redis.set).not.toHaveBeenCalled();
    });

    it("builds and caches cycle-time data from DB when cache is empty", async () => {
        const processRepo = {
            findOneBy: jest.fn().mockResolvedValue({
                id: "p1",
                startDate: "2024-01-01 00:00:00",
                endDate: "2024-01-01 02:00:00",
            }),
        };
        const eventBuilder = createQueryBuilderMock([
            makeEventWith(1, LifecycleTypes.CASE_ARRIVAL, "2024-01-01T00:00:00.000Z"),
            makeEventWith(1, LifecycleTypes.CASE_END, "2024-01-01T01:00:00.000Z"),
        ]);
        const eventRepo = {
            createQueryBuilder: jest.fn().mockReturnValue(eventBuilder),
        };
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepo;
                if (entity === Event) return eventRepo;
                throw new Error("unexpected repository");
            }),
        });
        redis.get.mockResolvedValueOnce(null);
        (buildCycleTimeSeries as jest.Mock).mockReturnValue([10, 20]);

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(eventRepo.createQueryBuilder).toHaveBeenCalledWith("event");
        expect(buildCycleTimeSeries).toHaveBeenCalledWith(
            expect.any(Array),
            "2024-01-01 00:00:00",
            "2024-01-01 02:00:00",
        );
        expect(redis.set).toHaveBeenCalledWith("cycle-time:p1", JSON.stringify([10, 20]), "EX", 60 * 60 * 24);
        expect(redis.disconnect).toHaveBeenCalled();
        expect(response).toEqual({body: [10, 20], status: 200});
    });

    it("returns 404 when the process is missing dates", async () => {
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

    it("returns 500 when an unexpected error occurs", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        redis.get.mockRejectedValueOnce(new Error("redis down"));

        const response = await GET({} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Failed to get cycle time data."}, status: 500});
        expect(NextResponse.json).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});



