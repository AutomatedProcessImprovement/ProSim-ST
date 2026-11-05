import {mockJsonResponse} from "../../testHelpers";

jest.mock("next/server", () => ({
    NextResponse: {json: jest.fn((body, init) => mockJsonResponse(body, init))},
}));
jest.mock("@db/mysql/typeorm", () => ({createMySQLConnection: jest.fn()}));
jest.mock("@db/cleanup", () => ({cleanupOldProcesses: jest.fn()}));

import {POST} from "./route";
import {cleanupOldProcesses} from "@db/cleanup";

const call = (authorization?: string) =>
    POST({headers: new Headers(authorization ? {authorization} : {})} as Request);

describe("POST /api/internal/cleanup", () => {
    const env = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, "log").mockImplementation(() => {});
        process.env = {...env, CLEANUP_TOKEN: "secret", PYTHON_MICROSERVICE_BASE_URL: "http://py"};
    });

    afterAll(() => { process.env = env; });

    it("is not found without the right token, or when no token is configured", async () => {
        expect((await call()).status).toBe(404);
        expect((await call("Bearer wrong")).status).toBe(404);
        delete process.env.CLEANUP_TOKEN;
        expect((await call("Bearer ")).status).toBe(404);
        expect(cleanupOldProcesses).not.toHaveBeenCalled();
    });

    it("runs the cleanup with a 30-day retention by default", async () => {
        (cleanupOldProcesses as jest.Mock).mockResolvedValue({deleted: ["a"], failed: [], orphanAssets: [], orphanRuns: []});

        const response = await call("Bearer secret");

        expect(response.status).toBe(200);
        expect(cleanupOldProcesses).toHaveBeenCalledWith(undefined, expect.objectContaining({
            retentionDays: 30,
            pythonBaseUrl: "http://py",
            assetsDir: expect.stringContaining("public/assets"),
        }));
    });

    it("reports failure when some runs could not be deleted", async () => {
        (cleanupOldProcesses as jest.Mock).mockResolvedValue({deleted: [], failed: ["a"], orphanAssets: [], orphanRuns: []});
        expect((await call("Bearer secret")).status).toBe(500);
    });
});
