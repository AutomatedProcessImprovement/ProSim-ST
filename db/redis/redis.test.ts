const mockOn = jest.fn();

jest.mock("ioredis", () => ({
    __esModule: true,
    default: jest.fn(),
}));

import {
    getRedisInstance,
    REDIS_KEY_PREFIX_CYCLE_TIME,
    REDIS_KEY_PREFIX_FRAMES,
    REDIS_KEY_PREFIX_WORKLOAD,
} from "@db/redis/redis";
import Redis from "ioredis";

describe("getRedisInstance", () => {
    const previousEnv = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = {...previousEnv};
        delete process.env.REDIS_HOST;
        delete process.env.REDIS_PORT;
        delete process.env.REDIS_PASSWORD;

        (Redis as unknown as jest.Mock).mockImplementation(() => ({
            on: mockOn,
        }));
    });

    afterAll(() => {
        process.env = previousEnv;
    });

    it("builds a Redis client with default environment values", () => {
        expect(REDIS_KEY_PREFIX_FRAMES).toBe("frames:");
        expect(REDIS_KEY_PREFIX_WORKLOAD).toBe("workload:");
        expect(REDIS_KEY_PREFIX_CYCLE_TIME).toBe("cycle-time:");

        const client = getRedisInstance();

        expect(client).toEqual({on: mockOn});
        expect(Redis).toHaveBeenCalledWith(expect.objectContaining({
            host: "localhost",
            port: 6379,
            password: "",
            lazyConnect: true,
            showFriendlyErrorStack: true,
            enableAutoPipelining: true,
            maxRetriesPerRequest: 0,
            retryStrategy: expect.any(Function),
        }));
        expect(mockOn).toHaveBeenCalledWith("error", expect.any(Function));

        const options = (Redis as unknown as jest.Mock).mock.calls[0][0];
        expect(options.retryStrategy(1)).toBe(200);
        expect(options.retryStrategy(3)).toBe(600);
    });

    it("accepts an explicit configuration override", () => {
        getRedisInstance({host: "redis.internal", port: 7001, password: "secret"});

        expect(Redis).toHaveBeenCalledWith(expect.objectContaining({
            host: "redis.internal",
            port: 7001,
            password: "secret",
        }));
    });

    it("throws a wrapped error when the client cannot be created", () => {
        (Redis as unknown as jest.Mock).mockImplementation(() => {
            throw new Error("boom");
        });

        expect(() => getRedisInstance()).toThrow("[Redis] Could not create a Redis instance");
    });

    it("throws from retryStrategy after too many attempts", () => {
        getRedisInstance();

        const options = (Redis as unknown as jest.Mock).mock.calls[0][0];
        expect(() => options.retryStrategy(4)).toThrow("[Redis] Could not connect after 4 attempts");
    });

    it("logs redis connection errors through the registered event listener", () => {
        const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
        getRedisInstance();

        const errorHandler = mockOn.mock.calls.find(([eventName]) => eventName === "error")?.[1];
        const error = new Error("network issue");
        errorHandler(error);

        expect(warnSpy).toHaveBeenCalledWith("[Redis] Error connecting", error);
        warnSpy.mockRestore();
    });
});


