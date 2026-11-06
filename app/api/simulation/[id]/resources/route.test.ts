/**
 * @jest-environment node
 */
import axios from "axios";
import {GET} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {getRedisInstance} from "@db/redis/redis";

jest.mock("axios", () => ({get: jest.fn()}));
jest.mock("@db/mysql/typeorm", () => ({createMySQLConnection: jest.fn()}));
jest.mock("@db/redis/redis", () => ({getRedisInstance: jest.fn(), REDIS_KEY_PREFIX_RESOURCES: "resources:"}));

const context = {params: Promise.resolve({id: "p1"})};
const request = new Request("http://test/");
const timeline = {stepMs: 3600000, pools: []};

describe("resources route", () => {
    let redis: {get: jest.Mock; set: jest.Mock; disconnect: jest.Mock};
    let run: Record<string, unknown> | undefined;

    beforeEach(() => {
        jest.clearAllMocks();
        run = {startDate: "2025-03-03 08:00:00", endDate: "2025-03-10 08:00:00", setToDelete: 0};
        redis = {get: jest.fn().mockResolvedValue(null), set: jest.fn(), disconnect: jest.fn()};
        (getRedisInstance as jest.Mock).mockReturnValue(redis);
        const builder = {select: jest.fn().mockReturnThis(), where: jest.fn().mockReturnThis(), getRawOne: jest.fn(async () => run)};
        (createMySQLConnection as jest.Mock).mockResolvedValue({getRepository: () => ({createQueryBuilder: () => builder})});
        (axios.get as jest.Mock).mockResolvedValue({data: timeline});
        process.env.PYTHON_MICROSERVICE_BASE_URL = "http://py";
    });

    it("asks the simulator for the playback window and caches the answer", async () => {
        const response = await GET(request, context);

        expect(await response.json()).toEqual(timeline);
        expect(axios.get).toHaveBeenCalledWith("http://py/resources/p1", {
            params: {start: "2025-03-03T08:00:00Z", end: "2025-03-10T08:00:00Z"},
        });
        expect(redis.set).toHaveBeenCalledWith("resources:p1", JSON.stringify(timeline), "EX", 86400);
        expect(redis.disconnect).toHaveBeenCalled();
    });

    it("serves the cached answer", async () => {
        redis.get.mockResolvedValue(JSON.stringify(timeline));

        expect(await (await GET(request, context)).json()).toEqual(timeline);
        expect(axios.get).not.toHaveBeenCalled();
    });

    it("answers 404 for an unknown run or a run the simulator no longer has", async () => {
        (axios.get as jest.Mock).mockRejectedValue({response: {status: 404}});
        expect((await GET(request, context)).status).toBe(404);

        run = undefined;
        expect((await GET(request, context)).status).toBe(404);
    });
});
