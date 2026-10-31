import {mockJsonResponse} from "../testHelpers";

jest.mock("next/server", () => ({
    NextResponse: {json: jest.fn((body, init) => mockJsonResponse(body, init))},
}));
jest.mock("@db/mysql/typeorm", () => ({createMySQLConnection: jest.fn()}));
jest.mock("@db/redis/redis", () => ({getRedisInstance: jest.fn()}));
jest.mock("axios", () => ({get: jest.fn()}));

import axios from "axios";
import {GET} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {getRedisInstance} from "@db/redis/redis";

describe("GET /api/health", () => {
    const redis = {ping: jest.fn(), disconnect: jest.fn()};
    const query = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (getRedisInstance as jest.Mock).mockReturnValue(redis);
        (createMySQLConnection as jest.Mock).mockResolvedValue({query});
        query.mockResolvedValue([{1: 1}]);
        redis.ping.mockResolvedValue("PONG");
        (axios.get as jest.Mock).mockResolvedValue({data: {status: "ok"}});
    });

    it("is ok when the database, the cache and the simulator answer", async () => {
        expect(await GET()).toEqual({status: 200, body: {status: "ok", checks: {database: true, cache: true, simulator: true}}});
        expect(redis.disconnect).toHaveBeenCalled();
    });

    it("names what is down", async () => {
        query.mockRejectedValue(new Error("down"));
        (axios.get as jest.Mock).mockRejectedValue(new Error("down"));

        expect(await GET()).toEqual({status: 503, body: {status: "degraded", checks: {database: false, cache: true, simulator: false}}});
    });
});
