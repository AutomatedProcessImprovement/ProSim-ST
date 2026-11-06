/**
 * @jest-environment node
 */
import axios from "axios";
import {copyFile} from "fs/promises";
import {GET, POST} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {saveSimulation} from "@db/mysql/simulationStore";
import {Scenario} from "@db/entities/Scenario";
import {activeJobCount} from "@utils/simulationJobs";

jest.mock("axios", () => ({get: jest.fn(), post: jest.fn()}));
jest.mock("fs/promises", () => ({copyFile: jest.fn(), unlink: jest.fn().mockResolvedValue(undefined)}));
jest.mock("@db/mysql/typeorm", () => ({createMySQLConnection: jest.fn()}));
jest.mock("@db/mysql/simulationStore", () => ({
    saveSimulation: jest.fn(),
    simulatorError: jest.fn(() => ({stage: "simulation", message: "failed"})),
}));
jest.mock("@utils/simulationJobs", () => ({
    activeJobCount: jest.fn(() => 0),
    createJob: jest.fn(),
    failJob: jest.fn(),
    MAX_ACTIVE_JOBS: 3,
}));

const baseRun = {
    id: "base", fileName: "base_model.bpmn", startDate: "2025-03-03 08:00:00", endDate: "2025-03-10 08:00:00",
    utcOffset: "+02:00", setToDelete: 0,
};
const pythonOptions = {
    supported: true, editablePools: true, pools: [{id: "c", name: "Clerk", size: 9}], tasks: [{id: "t", name: "Check"}],
};

const request = (body: unknown) => new Request("http://test/", {method: "POST", body: JSON.stringify(body)});
const context = (id = "base") => ({params: Promise.resolve({id})});

describe("what-if route", () => {
    let scenarios: {findOne: jest.Mock; find: jest.Mock};
    let run: Record<string, unknown> | undefined;

    beforeEach(() => {
        jest.clearAllMocks();
        run = baseRun;
        scenarios = {findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([])};
        const builder = {
            select: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getRawOne: jest.fn(async () => run),
        };
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: (entity: unknown) => entity === Scenario ? scenarios : {createQueryBuilder: () => builder},
        });
        (axios.get as jest.Mock).mockResolvedValue({data: pythonOptions});
        process.env.PYTHON_MICROSERVICE_BASE_URL = "http://py";
    });

    it("lists what can change and the earlier what-ifs", async () => {
        scenarios.find.mockResolvedValue([{processId: "s0", label: "Clerk 9 → 10"}]);

        const response = await GET(request({}), context());

        expect(await response.json()).toEqual({
            ...pythonOptions, baseProcessId: "base", scenarios: [{id: "s0", label: "Clerk 9 → 10"}],
        });
    });

    it("always works from the as-is run, even when asked from a to-be", async () => {
        scenarios.findOne.mockResolvedValue({baseProcessId: "base"});
        await GET(request({}), context("to-be"));

        expect(axios.get).toHaveBeenCalledWith("http://py/what-if/base");
    });

    it("answers 404 when the run is gone", async () => {
        run = undefined;
        expect((await POST(request({arrivalPercent: 10}), context())).status).toBe(404);
    });

    it("refuses unreadable and empty changes", async () => {
        expect((await POST(request({arrivalPercent: "lots"}), context())).status).toBe(400);
        expect((await POST(request({pools: {c: 9}}), context())).status).toBe(400);
    });

    it("refuses a run from before this feature", async () => {
        (axios.get as jest.Mock).mockResolvedValue({data: {...pythonOptions, supported: false}});
        expect((await POST(request({arrivalPercent: 10}), context())).status).toBe(409);
    });

    it("reuses a what-if that already ran instead of simulating it again", async () => {
        scenarios.find.mockResolvedValue([{processId: "s0", label: "Clerk 9 → 10"}]);

        const response = await POST(request({pools: {c: 10}}), context());

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({id: "s0", existing: true});
        expect(axios.post).not.toHaveBeenCalled();
    });

    it("answers 429 when the simulator is full", async () => {
        (activeJobCount as jest.Mock).mockReturnValueOnce(3);
        expect((await POST(request({arrivalPercent: 10}), context())).status).toBe(429);
    });

    it("runs the changes and stores them with the comparison", async () => {
        const comparison = {repeats: {seeds: 9}};
        (axios.post as jest.Mock).mockResolvedValue({data: {events: [], frames: [], comparison}});

        const response = await POST(request({pools: {c: 11}, arrivalPercent: 20}), context());
        const {id} = await response.json();
        await new Promise(resolve => setImmediate(resolve));

        expect(response.status).toBe(202);
        expect(copyFile).toHaveBeenCalledWith(expect.stringContaining("base_model.bpmn"), expect.stringContaining(`${id}_model.bpmn`));
        expect(axios.post).toHaveBeenCalledWith("http://py/scenario", {
            process_id: id,
            base_process_id: "base",
            edits: {pools: {c: 11}, arrival_percent: 20, tasks: {}, empty_start: false},
        });
        expect(saveSimulation).toHaveBeenCalledWith(
            expect.objectContaining({
                id,
                window: {
                    startDate: new Date("2025-03-03T08:00:00Z"),
                    endDate: new Date("2025-03-10T08:00:00Z"),
                    utcOffset: "+02:00",
                },
            }),
            expect.stringContaining(`${id}_model.bpmn`),
            {baseProcessId: "base", label: "Clerk 9 → 11 · Arrivals +20%", edits: {pools: {c: 11}, arrivalPercent: 20, tasks: {}}, comparison},
        );
    });
});
