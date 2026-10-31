import {mockJsonResponse} from "../../../testHelpers";

jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((body, init) => mockJsonResponse(body, init)),
    },
}));

jest.mock("axios", () => ({
    get: jest.fn(),
}));

jest.mock("@db/mysql/typeorm", () => ({
    createMySQLConnection: jest.fn(),
}));

import {GET} from "./route";
import axios from "axios";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {createJob, failJob, removeJob} from "@utils/simulationJobs";

const call = (id: string) => GET({} as Request, {params: Promise.resolve({id})});

describe("GET /api/simulation/[id]/status", () => {
    const count = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        removeJob("run-1");
        (createMySQLConnection as jest.Mock).mockResolvedValue({getRepository: () => ({count})});
    });

    it("merges the simulator's progress into a running job", async () => {
        createJob("run-1");
        (axios.get as jest.Mock).mockResolvedValue({data: {stage: "state", durations: {queued: 0.2, state: 4}}});

        expect(await call("run-1")).toEqual({body: {stage: "state", durations: {queued: 0.2, state: 4}}, status: 200});
        expect(axios.get).toHaveBeenCalledWith(expect.stringMatching(/\/progress\/run-1$/), {timeout: 5000});
    });

    it("keeps the last known progress when the simulator is slow to answer", async () => {
        createJob("run-1");
        (axios.get as jest.Mock)
            .mockResolvedValueOnce({data: {stage: "simulation", durations: {state: 2, simulation: 5}}})
            .mockRejectedValueOnce(new Error("timeout"));

        await call("run-1");
        expect(await call("run-1")).toEqual({body: {stage: "simulation", durations: {state: 2, simulation: 5}}, status: 200});
    });

    it("shows a queued job when the simulator has no progress yet", async () => {
        createJob("run-1");
        (axios.get as jest.Mock).mockRejectedValue(new Error("404"));

        expect(await call("run-1")).toEqual({body: {stage: "queued", durations: {}}, status: 200});
    });

    it("returns the failure of a failed job", async () => {
        createJob("run-1");
        failJob("run-1", {stage: "simulation", message: "KeyError: 'Task_1'"});
        (axios.get as jest.Mock).mockRejectedValue(new Error("404"));

        expect(await call("run-1")).toEqual({
            body: {stage: "failed", durations: {}, error: {stage: "simulation", message: "KeyError: 'Task_1'"}},
            status: 200,
        });
    });

    it("treats a saved simulation without a job as done and an unknown one as not found", async () => {
        count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

        expect(await call("run-1")).toEqual({body: {stage: "done", durations: {}}, status: 200});
        expect((await call("run-1")).status).toBe(404);
        expect(count).toHaveBeenCalledWith({where: {id: "run-1"}});
    });
});
