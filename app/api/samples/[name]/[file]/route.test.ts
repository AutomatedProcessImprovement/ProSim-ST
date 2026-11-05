import {mockJsonResponse} from "../../../testHelpers";

jest.mock("next/server", () => {
    class MockNextResponse {
        body: unknown;
        status: number;
        headers: Record<string, string>;
        constructor(body: unknown, init: { status: number, headers: Record<string, string> }) {
            this.body = body;
            this.status = init.status;
            this.headers = init.headers;
        }
        static json = jest.fn((body, init) => mockJsonResponse(body, init));
    }
    return {NextResponse: MockNextResponse};
});

jest.mock("fs/promises", () => ({
    readFile: jest.fn(),
}));

import {GET} from "./route";
import {readFile} from "fs/promises";

const call = (name: string, file: string) =>
    GET({} as Request, {params: Promise.resolve({name, file})}) as unknown as Promise<{
        status: number, body: unknown, headers?: Record<string, string>
    }>;

describe("GET /api/samples/[name]/[file]", () => {
    beforeEach(() => jest.clearAllMocks());

    it("serves a known file of a known sample", async () => {
        (readFile as jest.Mock).mockResolvedValue(Buffer.from("CaseId"));

        const response = await call("loanApplication", "ongoing_event_log.csv");

        expect(readFile).toHaveBeenCalledWith(expect.stringMatching(/sampleProcesses\/loanApplication\/ongoing_event_log\.csv$/));
        expect(response.status).toBe(200);
        expect(response.headers["Content-Type"]).toBe("text/csv");
    });

    it("refuses unknown samples and files, including path tricks", async () => {
        expect((await call("../../etc", "ongoing_event_log.csv")).status).toBe(404);
        expect((await call("loanApplication", "../../../.env")).status).toBe(404);
        expect(readFile).not.toHaveBeenCalled();
    });

    it("returns 404 when the file is missing on disk", async () => {
        (readFile as jest.Mock).mockRejectedValue(new Error("ENOENT"));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

        expect((await call("p2p", "bpmn_model.bpmn")).status).toBe(404);
        logSpy.mockRestore();
    });
});
