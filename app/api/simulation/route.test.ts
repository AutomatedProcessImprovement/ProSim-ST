import {mockJsonResponse} from "../testHelpers";

jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((body, init) => mockJsonResponse(body, init)),
    },
}));

jest.mock("@db/redis/redis", () => ({
    getRedisInstance: jest.fn(),
    REDIS_KEY_PREFIX_FRAMES: "frames:",
}));

jest.mock("fs/promises", () => ({
    writeFile: jest.fn(),
}));

jest.mock("fs", () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
}));

jest.mock("axios", () => ({
    post: jest.fn(),
}));

jest.mock("@db/mysql/typeorm", () => ({
    createMySQLConnection: jest.fn(),
}));

import {POST} from "./route";
import {getRedisInstance, REDIS_KEY_PREFIX_FRAMES} from "@db/redis/redis";
import {writeFile} from "fs/promises";
import {existsSync, mkdirSync} from "fs";
import axios from "axios";
import {createMySQLConnection} from "@db/mysql/typeorm";

describe("POST /api/simulation", () => {
    const redis = {
        set: jest.fn(),
        disconnect: jest.fn(),
    };
    const queryRunner = {
        connect: jest.fn(),
        startTransaction: jest.fn(),
        query: jest.fn(),
        commitTransaction: jest.fn(),
        rollbackTransaction: jest.fn(),
        release: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getRedisInstance as jest.Mock).mockReturnValue(redis);
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            createQueryRunner: jest.fn(() => queryRunner),
        });
        (existsSync as jest.Mock).mockReturnValue(false);
    });

    const buildBody = () => {
        const values = new Map<string, unknown>([
            ["id", "process-1"],
            ["config", JSON.stringify({
                startingPoint: "2024-01-01T00:00:00",
                simulationHorizonValue: 1,
                simulationHorizonUnit: "days",
            })],
            ["mapping", JSON.stringify({case: "case"})],
            ["logFile", {name: "log.csv"}],
            ["bpmnFile", {
                name: "model file.bpmn",
                arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
            }],
            ["jsonFile", {name: "params.json"}],
        ]);

        return {
            get: jest.fn((key: string) => values.get(key) ?? null),
        } as unknown as FormData;
    };

    it("returns 400 when no BPMN file is provided", async () => {
        const body = {get: jest.fn().mockReturnValue(null)} as unknown as FormData;
        const response = await POST({formData: jest.fn().mockResolvedValue(body)} as unknown as Request);

        expect(response).toEqual({body: {error: "No files received."}, status: 400});
    });

    it("creates directories, persists data, caches frames, and returns 201 on success", async () => {
        const body = buildBody();
        (axios.post as jest.Mock).mockResolvedValue({
            data: {
                events: [
                    {
                        case_id: 1,
                        lifecycle: "START",
                        timestamp: "2024-01-01T01:00:00",
                        node_id: "Task_1",
                        paths: {token: ["Flow_1", "Task_1"]},
                    },
                    {
                        case_id: 2,
                        lifecycle: "COMPLETE",
                        timestamp: "2024-01-01T03:00:00",
                        node_id: "Task_2",
                        paths: {token: ["Flow_2", "Task_2"]},
                    },
                    {
                        case_id: 3,
                        lifecycle: "ENABLE",
                        timestamp: "2023-12-31T23:00:00",
                        node_id: "Task_0",
                        paths: {token: ["Flow_0", "Task_0"]},
                    },
                ],
                frames: [{
                    case_id: 1,
                    active_elements: {token: "Task_1"},
                    arrival_time: "2023-12-30T10:15:00.646000+0200",
                }, {
                    case_id: 4,
                    active_elements: {token: "Flow_4"},
                    arrival_time: null,
                }],
            },
        });

        const response = await POST({formData: jest.fn().mockResolvedValue(body)} as unknown as Request);

        expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining("public/assets"), {recursive: true});
        expect(writeFile).toHaveBeenCalledWith(
            expect.stringContaining("process-1_model_file.bpmn"),
            expect.any(Buffer),
        );
        expect(queryRunner.connect).toHaveBeenCalled();
        expect(queryRunner.startTransaction).toHaveBeenCalled();
        expect(queryRunner.query).toHaveBeenCalledTimes(3);
        // When the cases open at the start started, stored in UTC like the events
        expect(queryRunner.query).toHaveBeenNthCalledWith(3, expect.stringContaining("INSERT INTO frame (caseId, activeElements, arrivalTime, processId)"), [
            1, JSON.stringify({token: "Task_1"}), "2023-12-30 08:15:00", "process-1",
            4, JSON.stringify({token: "Flow_4"}), null, "process-1",
        ]);
        expect(queryRunner.commitTransaction).toHaveBeenCalled();
        expect(queryRunner.release).toHaveBeenCalled();
        expect(redis.set).toHaveBeenCalledWith(
            `${REDIS_KEY_PREFIX_FRAMES}process-1`,
            JSON.stringify([
                {caseId: 1, activeElements: {token: "Task_1"}, arrivalTime: "2023-12-30T08:15:00.646Z"},
                {caseId: 4, activeElements: {token: "Flow_4"}},
            ]),
            "EX",
            60 * 60 * 24,
        );
        expect(redis.disconnect).toHaveBeenCalled();
        expect(response).toEqual({body: {id: "process-1"}, status: 201});
    });

    it("rolls back the transaction, releases resources and returns 500 when the bulk insert fails", async () => {
        const body = buildBody();
        (existsSync as jest.Mock).mockReturnValue(true);
        (axios.post as jest.Mock).mockResolvedValue({
            data: {
                events: [{
                    case_id: 1,
                    lifecycle: "START",
                    timestamp: "2024-01-01T01:00:00",
                    node_id: "Task_1",
                    paths: {token: ["Flow_1", "Task_1"]},
                }],
                frames: [{
                    case_id: 1,
                    active_elements: {token: "Task_1"},
                }],
            },
        });
        queryRunner.query.mockRejectedValueOnce(new Error("insert failed"));
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

        const response = await POST({formData: jest.fn().mockResolvedValue(body)} as unknown as Request);

        expect(mkdirSync).not.toHaveBeenCalled();
        expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
        expect(queryRunner.release).toHaveBeenCalled();
        expect(redis.set).not.toHaveBeenCalled();
        expect(response).toEqual({body: {error: "Failed to get simulation data."}, status: 500});
        errorSpy.mockRestore();
        logSpy.mockRestore();
    });

    it("skips the frame insert when no cases are in progress at the starting point", async () => {
        const body = buildBody();
        (axios.post as jest.Mock).mockResolvedValue({
            data: {
                events: [{
                    case_id: 1,
                    lifecycle: "CASE_ARRIVAL",
                    timestamp: "2024-01-01T01:00:00",
                    node_id: "Start_1",
                    paths: {token: ["Start_1"]},
                }],
                frames: [],
            },
        });

        const response = await POST({formData: jest.fn().mockResolvedValue(body)} as unknown as Request);

        expect(queryRunner.query).toHaveBeenCalledTimes(2);
        expect(queryRunner.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO frame"), expect.anything());
        expect(queryRunner.commitTransaction).toHaveBeenCalled();
        expect(response).toEqual({body: {id: "process-1"}, status: 201});
    });

    it("converts the starting point with the log's UTC offset and keeps only events inside the window", async () => {
        const body = buildBody();
        const config = JSON.stringify({
            startingPoint: "2024-01-01T10:00:00",
            simulationHorizonValue: 1,
            simulationHorizonUnit: "days",
            utcOffset: "+02:00",
        });
        const get = body.get as jest.Mock;
        const originalGet = get.getMockImplementation();
        get.mockImplementation((key: string) => key === "config" ? config : originalGet(key));
        (axios.post as jest.Mock).mockResolvedValue({
            data: {
                events: [
                    {case_id: 1, lifecycle: "START", timestamp: "2024-01-01T09:00:00Z", node_id: "Task_1", paths: {}},
                    {case_id: 1, lifecycle: "COMPLETE", timestamp: "2024-01-03T09:00:00Z", node_id: "Task_1", paths: {}},
                ],
                frames: [],
            },
        });

        const response = await POST({formData: jest.fn().mockResolvedValue(body)} as unknown as Request);

        const pythonBody = (axios.post as jest.Mock).mock.calls[0][1] as FormData;
        expect(pythonBody.get("start_time")).toBe("2024-01-01T08:00:00.000Z");
        expect(pythonBody.get("simulation_horizon")).toBe("2024-01-02T08:00:00.000Z");
        expect(queryRunner.query).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT INTO process"),
            ["process-1", "process-1_model_file.bpmn", "2024-01-01 08:00:00", "2024-01-02 08:00:00", "+02:00"]);
        expect(queryRunner.query).toHaveBeenNthCalledWith(2, expect.stringContaining("INSERT INTO event"),
            [1, "START", "2024-01-01 09:00:00", "Task_1", "{}", "process-1"]);
        expect(response).toEqual({body: {id: "process-1"}, status: 201});
    });

    it("returns 500 when simulation data retrieval fails", async () => {
        const body = buildBody();
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        (axios.post as jest.Mock).mockRejectedValue(new Error("python down"));

        const response = await POST({formData: jest.fn().mockResolvedValue(body)} as unknown as Request);

        expect(response).toEqual({body: {error: "Failed to get simulation data."}, status: 500});
        logSpy.mockRestore();
    });
});


