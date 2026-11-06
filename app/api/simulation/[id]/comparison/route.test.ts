/**
 * @jest-environment node
 */
import {GET} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Scenario} from "@db/entities/Scenario";

jest.mock("@db/mysql/typeorm", () => ({createMySQLConnection: jest.fn()}));

const context = {params: Promise.resolve({id: "s1"})};
const request = new Request("http://test/");

describe("comparison route", () => {
    const scenarios = {findOne: jest.fn()};
    const processes = {findOne: jest.fn(), update: jest.fn()};

    beforeEach(() => {
        jest.clearAllMocks();
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: (entity: unknown) => entity === Scenario ? scenarios : processes,
        });
    });

    it("returns the stored comparison and keeps both runs alive", async () => {
        scenarios.findOne.mockResolvedValue({
            baseProcessId: "base", label: "Clerk 9 → 10", edits: {pools: {c: 10}}, comparison: {repeats: {seeds: 9}},
        });
        processes.findOne.mockResolvedValue({utcOffset: "+02:00"});

        const response = await GET(request, context);

        expect(await response.json()).toEqual({
            processId: "s1",
            baseProcessId: "base",
            label: "Clerk 9 → 10",
            edits: {pools: {c: 10}},
            utcOffset: "+02:00",
            comparison: {repeats: {seeds: 9}},
        });
        const [[where]] = processes.update.mock.calls;
        expect(where.id.value).toEqual(["s1", "base"]);
    });

    it("answers 404 for a run without a comparison", async () => {
        scenarios.findOne.mockResolvedValue(null);
        expect((await GET(request, context)).status).toBe(404);
    });
});
