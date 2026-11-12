/**
 * @jest-environment node
 */
import {createQueryBuilderMock} from "../../../testHelpers";

jest.mock("@db/mysql/typeorm", () => ({
    createMySQLConnection: jest.fn(),
}));

jest.mock("@db/redis/redis", () => ({
    getRedisInstance: jest.fn(() => ({disconnect: jest.fn()})),
}));

jest.mock("@db/mysql/frames", () => ({
    loadInitialFrames: jest.fn().mockResolvedValue([]),
}));

jest.mock("axios", () => ({
    get: jest.fn(),
}));

jest.mock("fs/promises", () => ({
    readFile: jest.fn(),
}));

import {GET} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {readFile} from "fs/promises";
import axios from "axios";

const BPMN = `<sequenceFlow id="F" targetRef="Task_A"/><task id="Task_A" name="Check form"/>`;
const process = {
    fileName: "model.bpmn", startDate: "2024-01-01 00:00:00", endDate: "2024-01-01 04:00:00", utcOffset: "+01:00", setToDelete: 0,
};
const events = [
    {caseId: 1, lifecycle: "ENABLE", nodeId: "Task_A", timestamp: "2024-01-01 00:00:00"},
    {caseId: 1, lifecycle: "START", nodeId: "Task_A", timestamp: "2024-01-01 01:00:00"},
    {caseId: 1, lifecycle: "COMPLETE", nodeId: "Task_A", timestamp: "2024-01-01 03:00:00"},
];

const call = (query: string) =>
    GET(new Request(`http://localhost/api/simulation/abcdefgh-1234/export${query}`), {params: Promise.resolve({id: "abcdefgh-1234"})});

describe("GET /api/simulation/[id]/export", () => {
    const useProcess = (row: unknown) => (createMySQLConnection as jest.Mock).mockResolvedValue({
        getRepository: () => ({createQueryBuilder: () => createQueryBuilderMock(row)}),
        query: jest.fn().mockResolvedValue(events),
    });

    beforeEach(() => {
        jest.clearAllMocks();
        (readFile as jest.Mock).mockResolvedValue(BPMN);
        useProcess(process);
    });

    it("sends the simulated log as a CSV download", async () => {
        const response = await call("?type=log");

        expect(response.status).toBe(200);
        expect(response.headers.get("Content-Type")).toContain("text/csv");
        expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="simulated-log-abcdefgh.csv"');
        expect((await response.text()).split("\r\n")[1])
            .toBe("1,Check form,2024-01-01T01:00:00+01:00,2024-01-01T02:00:00+01:00,2024-01-01T04:00:00+01:00");
    });

    it("sends the statistics of the whole run", async () => {
        const response = await call("?type=activities");

        expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="activity-statistics-abcdefgh.csv"');
        expect((await response.text()).split("\r\n")[1]).toBe("Check form,1,1,2,1,1");
    });

    it("sends the process model the run used", async () => {
        const response = await call("?type=model");

        expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="process-model-abcdefgh.bpmn"');
        expect(await response.text()).toBe(BPMN);
        expect(readFile).toHaveBeenCalledWith(expect.stringMatching(/public\/assets\/model\.bpmn$/), "utf-8");
    });

    it("sends the simulation parameters the run used", async () => {
        const parameters = {resource_profiles: [{id: "pool", name: "Clerks"}]};
        (axios.get as jest.Mock).mockResolvedValue({data: parameters});

        const response = await call("?type=parameters");

        expect(axios.get).toHaveBeenCalledWith(expect.stringMatching(/\/parameters\/abcdefgh-1234$/));
        expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="simulation-parameters-abcdefgh.json"');
        expect(JSON.parse(await response.text())).toEqual(parameters);
    });

    it("answers 404 when the simulator no longer has the parameters", async () => {
        (axios.get as jest.Mock).mockRejectedValue({response: {status: 404}});

        expect((await call("?type=parameters")).status).toBe(404);
    });

    it("answers 404 for the model when its file is gone", async () => {
        jest.spyOn(console, "warn").mockImplementation(() => {});
        (readFile as jest.Mock).mockRejectedValue(new Error("missing"));

        expect((await call("?type=model")).status).toBe(404);
    });

    it("refuses unknown exports", async () => {
        expect((await call("?type=passwords")).status).toBe(400);
        expect(createMySQLConnection).not.toHaveBeenCalled();
    });

    it("answers 404 for a missing or deleted simulation", async () => {
        useProcess(undefined);
        expect((await call("?type=log")).status).toBe(404);

        useProcess({...process, setToDelete: 1});
        expect((await call("?type=log")).status).toBe(404);
    });

    it("still exports when the model file is gone, using task ids", async () => {
        jest.spyOn(console, "warn").mockImplementation(() => {});
        (readFile as jest.Mock).mockRejectedValue(new Error("missing"));

        expect((await (await call("?type=log")).text()).split("\r\n")[1]).toContain("1,Task_A,");
    });
});
