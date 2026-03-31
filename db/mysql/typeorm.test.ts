jest.mock("@db/mysql/dataSource", () => ({
    AppDataSource: {
        isInitialized: false,
        initialize: jest.fn(),
    },
}));

import {createMySQLConnection} from "@db/mysql/typeorm";
import {AppDataSource} from "@db/mysql/dataSource";

describe("createMySQLConnection", () => {
    const mockInitialize = (AppDataSource as unknown as {initialize: jest.Mock}).initialize;

    beforeEach(() => {
        jest.clearAllMocks();
        (AppDataSource as unknown as {isInitialized: boolean}).isInitialized = false;
    });

    it("initializes the data source when needed and returns it", async () => {
        mockInitialize.mockResolvedValue(AppDataSource);
        const consoleSpy = jest.spyOn(console, "log").mockImplementation(() => {});

        await expect(createMySQLConnection()).resolves.toBe(AppDataSource);
        expect(mockInitialize).toHaveBeenCalledTimes(1);

        consoleSpy.mockRestore();
    });

    it("skips initialization when the data source is already initialized", async () => {
        (AppDataSource as unknown as {isInitialized: boolean}).isInitialized = true;

        await expect(createMySQLConnection()).resolves.toBe(AppDataSource);
        expect(mockInitialize).not.toHaveBeenCalled();
    });

    it("logs initialization errors and still returns the shared data source", async () => {
        mockInitialize.mockRejectedValue(new Error("init failed"));
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

        await expect(createMySQLConnection()).resolves.toBe(AppDataSource);
        expect(consoleSpy).toHaveBeenCalledWith("Error during DataSource initialization", expect.any(Error));

        consoleSpy.mockRestore();
    });
});







