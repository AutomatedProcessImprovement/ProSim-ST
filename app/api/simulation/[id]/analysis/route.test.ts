import {mockJsonResponse, createQueryBuilderMock} from "../../../testHelpers";

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
    REDIS_KEY_PREFIX_ANALYSIS: "analysis-v2:",
}));

jest.mock("@db/mysql/frames", () => ({
    loadInitialFrames: jest.fn(),
}));

jest.mock("fs/promises", () => ({
    readFile: jest.fn(),
}));

jest.mock("@utils/processAnalysis", () => ({
    buildProcessAnalysis: jest.fn(),
    readFlowTargets: jest.fn(),
}));

import {GET} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {getRedisInstance} from "@db/redis/redis";
import {readFile} from "fs/promises";
import {buildProcessAnalysis, readFlowTargets} from "@utils/processAnalysis";
import {Process} from "@db/entities/Process";
import {loadInitialFrames} from "@db/mysql/frames";

describe("GET /api/simulation/[id]/analysis", () => {
    const redis = {
        get: jest.fn(),
        set: jest.fn(),
        disconnect: jest.fn(),
    };
    const call = () => GET({} as Request, {params: Promise.resolve({id: "p1"})});

    const mockDatabase = (process: unknown, events: unknown[] = [], frames: unknown[] = []) => {
        const processRepo = {createQueryBuilder: jest.fn().mockReturnValue(createQueryBuilderMock(process))};
        const dataSource = {
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepo;
                throw new Error("unexpected repository");
            }),
            query: jest.fn().mockResolvedValue(events),
        };
        (createMySQLConnection as jest.Mock).mockResolvedValue(dataSource);
        (loadInitialFrames as jest.Mock).mockResolvedValue(frames);
        return {dataSource};
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getRedisInstance as jest.Mock).mockReturnValue(redis);
    });

    it("returns the cached analysis when present", async () => {
        redis.get.mockResolvedValueOnce(JSON.stringify({open: [1]}));

        expect(await call()).toEqual({body: {open: [1]}, status: 200});
        expect(createMySQLConnection).not.toHaveBeenCalled();
    });

    it("builds the analysis from events, frames and the model's flows, and caches it", async () => {
        const events = [{caseId: 1, lifecycle: "CASE_ARRIVAL", nodeId: "Start", timestamp: "2024-01-01 00:10:00"}];
        const frames = [{caseId: 2, activeElements: {token_0: "Flow_1"}, arrivalTime: "2023-12-31T08:00:00.000Z"}];
        const {dataSource} = mockDatabase(
            {fileName: "p1_bpmn_model.bpmn", startDate: "2024-01-01 00:00:00", endDate: "2024-01-01 02:00:00", setToDelete: false},
            events, frames,
        );
        redis.get.mockResolvedValueOnce(null);
        (readFile as jest.Mock).mockResolvedValue("<bpmn/>");
        (readFlowTargets as jest.Mock).mockReturnValue({Flow_1: "Task_A"});
        (buildProcessAnalysis as jest.Mock).mockReturnValue({open: [1, 2]});

        const response = await call();

        expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY timestamp ASC, id ASC"), ["p1"]);
        expect(loadInitialFrames).toHaveBeenCalledWith(redis, dataSource, "p1");
        expect(readFile).toHaveBeenCalledWith(expect.stringContaining("p1_bpmn_model.bpmn"), "utf-8");
        expect(buildProcessAnalysis).toHaveBeenCalledWith(events, frames, {Flow_1: "Task_A"}, "2024-01-01 00:00:00", "2024-01-01 02:00:00");
        expect(redis.set).toHaveBeenCalledWith("analysis-v2:p1", JSON.stringify({open: [1, 2]}), "EX", 60 * 60 * 24);
        expect(response).toEqual({body: {open: [1, 2]}, status: 200});
    });

    it("still answers when the model file cannot be read", async () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        mockDatabase({fileName: "gone.bpmn", startDate: "2024-01-01 00:00:00", endDate: "2024-01-01 02:00:00", setToDelete: false});
        redis.get.mockResolvedValueOnce(null);
        (readFile as jest.Mock).mockRejectedValue(new Error("ENOENT"));
        (buildProcessAnalysis as jest.Mock).mockReturnValue({open: []});

        const response = await call();

        expect(buildProcessAnalysis).toHaveBeenCalledWith([], [], {}, "2024-01-01 00:00:00", "2024-01-01 02:00:00");
        expect(response.status).toBe(200);
        warnSpy.mockRestore();
    });

    it("returns 404 for a missing or deleted process", async () => {
        mockDatabase(null);
        redis.get.mockResolvedValueOnce(null);
        expect(await call()).toEqual({body: {error: "Process not found"}, status: 404});

        mockDatabase({fileName: "x", startDate: "2024-01-01 00:00:00", endDate: "2024-01-01 02:00:00", setToDelete: true});
        redis.get.mockResolvedValueOnce(null);
        expect((await call()).status).toBe(404);
    });

    it("returns 500 when the analysis fails", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        redis.get.mockResolvedValueOnce(null);
        (createMySQLConnection as jest.Mock).mockRejectedValue(new Error("db down"));

        expect(await call()).toEqual({body: {error: "Failed to analyse the simulation."}, status: 500});
        errorSpy.mockRestore();
    });
});
