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
    unlink: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("fs", () => ({
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
}));

jest.mock("axios", () => ({
    post: jest.fn(),
}));

const MODEL = `<definitions><process id="p">
  <startEvent id="start"/><userTask id="Task_1" name="A"/><endEvent id="end"/>
</process><BPMNDiagram><BPMNPlane><BPMNShape id="s" bpmnElement="Task_1"/></BPMNPlane></BPMNDiagram></definitions>`;
const PARAMETERS = JSON.stringify({
    resource_profiles: [], resource_calendars: [], arrival_time_distribution: {},
    gateway_branching_probabilities: [], task_resource_distribution: [{task_id: "Task_1", resources: []}],
});

jest.mock("@db/mysql/typeorm", () => ({
    createMySQLConnection: jest.fn(),
}));

import {POST} from "./route";
import {getRedisInstance, REDIS_KEY_PREFIX_FRAMES} from "@db/redis/redis";
import {unlink, writeFile} from "fs/promises";
import {existsSync, mkdirSync} from "fs";
import axios from "axios";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {getJob, removeJob} from "@utils/simulationJobs";

const settle = async () => {
    for (let i = 0; i < 20; i++) await new Promise(resolve => setTimeout(resolve, 0));
};

const submit = async (body: FormData) => {
    const response = await POST({formData: jest.fn().mockResolvedValue(body)} as unknown as Request);
    await settle();
    return response;
};

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
        removeJob("process-1");
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
                text: jest.fn().mockResolvedValue(MODEL),
                arrayBuffer: jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
            }],
            ["jsonFile", {name: "params.json", text: jest.fn().mockResolvedValue(PARAMETERS)}],
        ]);

        return {
            get: jest.fn((key: string) => values.get(key) ?? null),
        } as unknown as FormData;
    };

    it("returns 400 when no BPMN file is provided", async () => {
        const body = {get: jest.fn().mockReturnValue(null)} as unknown as FormData;
        const response = await submit(body);

        expect(response).toEqual({body: {error: "No files received."}, status: 400});
    });

    it("returns 202, then persists data and caches frames in the background", async () => {
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
                    task_times: {Task_1: {enabled: "2023-12-30T10:15:00.000000+0200", started: null}},
                }, {
                    case_id: 4,
                    active_elements: {token: "Flow_4"},
                    arrival_time: null,
                }],
            },
        });

        const response = await submit(body);

        expect(mkdirSync).toHaveBeenCalledWith(expect.stringContaining("public/assets"), {recursive: true});
        expect(writeFile).toHaveBeenCalledWith(
            expect.stringContaining("process-1_model_file.bpmn"),
            MODEL.replace("<userTask", "<task"),
        );
        expect(queryRunner.connect).toHaveBeenCalled();
        expect(queryRunner.startTransaction).toHaveBeenCalled();
        expect(queryRunner.query).toHaveBeenCalledTimes(3);
        expect(queryRunner.query).toHaveBeenNthCalledWith(3, expect.stringContaining("INSERT INTO frame (caseId, activeElements, arrivalTime, taskTimes, processId)"), [
            1, JSON.stringify({token: "Task_1"}), "2023-12-30 08:15:00", JSON.stringify({Task_1: {enabled: Date.UTC(2023, 11, 30, 8, 15), started: null}}), "process-1",
            4, JSON.stringify({token: "Flow_4"}), null, null, "process-1",
        ]);
        expect(queryRunner.commitTransaction).toHaveBeenCalled();
        expect(queryRunner.release).toHaveBeenCalled();
        expect(redis.set).toHaveBeenCalledWith(
            `${REDIS_KEY_PREFIX_FRAMES}process-1`,
            JSON.stringify([
                {caseId: 1, activeElements: {token: "Task_1"}, arrivalTime: "2023-12-30T08:15:00.646Z", taskTimes: {Task_1: {enabled: Date.UTC(2023, 11, 30, 8, 15), started: null}}},
                {caseId: 4, activeElements: {token: "Flow_4"}},
            ]),
            "EX",
            60 * 60 * 24,
        );
        expect(redis.disconnect).toHaveBeenCalled();
        expect(response).toEqual({body: {id: "process-1"}, status: 202});
    });

    it("rolls back the transaction, removes the model and fails the job when the bulk insert fails", async () => {
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

        const response = await submit(body);

        expect(mkdirSync).not.toHaveBeenCalled();
        expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
        expect(queryRunner.release).toHaveBeenCalled();
        expect(redis.set).not.toHaveBeenCalled();
        expect(unlink).toHaveBeenCalledWith(expect.stringContaining("process-1_model_file.bpmn"));
        expect(response).toEqual({body: {id: "process-1"}, status: 202});
        expect(getJob("process-1")).toMatchObject({
            stage: "failed",
            error: {stage: "saving", message: "The results could not be saved. Please try again."},
        });
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

        const response = await submit(body);

        expect(queryRunner.query).toHaveBeenCalledTimes(2);
        expect(queryRunner.query).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO frame"), expect.anything());
        expect(queryRunner.commitTransaction).toHaveBeenCalled();
        expect(response).toEqual({body: {id: "process-1"}, status: 202});
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

        const response = await submit(body);

        const pythonBody = (axios.post as jest.Mock).mock.calls[0][1] as FormData;
        expect(pythonBody.get("start_time")).toBe("2024-01-01T10:00:00.000+02:00");
        expect(pythonBody.get("simulation_horizon")).toBe("2024-01-02T10:00:00.000+02:00");
        expect(queryRunner.query).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT INTO process"),
            ["process-1", "process-1_model_file.bpmn", "2024-01-01 08:00:00", "2024-01-02 08:00:00", "+02:00"]);
        expect(queryRunner.query).toHaveBeenNthCalledWith(2, expect.stringContaining("INSERT INTO event"),
            [1, "START", "2024-01-01 09:00:00", "Task_1", "{}", "process-1"]);
        expect(response).toEqual({body: {id: "process-1"}, status: 202});
    });

    it("fails the job with the simulator's stage and message", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        (axios.post as jest.Mock).mockRejectedValue({
            response: {status: 422, data: {detail: {stage: "state", message: "ValueError: unknown activity"}}},
        });

        const response = await submit(buildBody());

        expect(response).toEqual({body: {id: "process-1"}, status: 202});
        expect(getJob("process-1")).toMatchObject({stage: "failed", error: {stage: "state", message: "ValueError: unknown activity"}});
        expect(unlink).toHaveBeenCalledWith(expect.stringContaining("process-1_model_file.bpmn"));
        expect(queryRunner.query).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });

    it("reports an unreachable simulator", async () => {
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        (axios.post as jest.Mock).mockRejectedValue(new Error("connect ECONNREFUSED"));

        await submit(buildBody());

        expect(getJob("process-1")?.error).toEqual({
            stage: "queued",
            message: "The simulator could not be reached. Please try again later.",
        });
        errorSpy.mockRestore();
    });

    it("rejects files that cannot be simulated before starting anything", async () => {
        const body = buildBody();
        const get = body.get as jest.Mock;
        const originalGet = get.getMockImplementation();
        get.mockImplementation((key: string) => key === "jsonFile"
            ? {name: "params.json", text: jest.fn().mockResolvedValue('{"tasks": []}')}
            : originalGet(key));

        const response = await submit(body);

        expect(response).toEqual({
            body: {
                error: "The uploaded files cannot be simulated.",
                issues: [expect.stringContaining("not in the Prosimos format")],
            },
            status: 400,
        });
        expect(writeFile).not.toHaveBeenCalled();
        expect(axios.post).not.toHaveBeenCalled();
        expect(getJob("process-1")).toBeUndefined();
    });

    it("refuses a second run of the same simulation and too many runs at once", async () => {
        (axios.post as jest.Mock).mockReturnValue(new Promise(() => {}));

        await submit(buildBody());
        expect(await submit(buildBody())).toEqual({body: {error: "This simulation is already running."}, status: 409});

        const other = (id: string) => {
            const body = buildBody();
            const get = body.get as jest.Mock;
            const originalGet = get.getMockImplementation();
            get.mockImplementation((key: string) => key === "id" ? id : originalGet(key));
            return body;
        };
        await submit(other("process-2"));
        await submit(other("process-3"));
        expect(await submit(other("process-4"))).toEqual({
            body: {error: "The simulator is busy with other runs. Please try again in a few minutes."},
            status: 429,
        });
        ["process-2", "process-3", "process-4"].forEach(removeJob);
    });
});
