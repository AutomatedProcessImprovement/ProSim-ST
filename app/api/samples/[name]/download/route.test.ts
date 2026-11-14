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

const call = (name: string) =>
    GET({} as Request, {params: Promise.resolve({name})}) as unknown as Promise<{
        status: number, body: Uint8Array, headers: Record<string, string>
    }>;

describe("GET /api/samples/[name]/download", () => {
    beforeEach(() => jest.clearAllMocks());

    it("packs the log, model and parameters of a sample into one zip", async () => {
        (readFile as jest.Mock).mockResolvedValue(Buffer.from("content"));

        const response = await call("p2pfin");

        expect((readFile as jest.Mock).mock.calls.map(([path]) => path.split("sampleProcesses/")[1]))
            .toEqual(["p2pfin/ongoing_event_log.csv", "p2pfin/bpmn_model.bpmn", "p2pfin/json_parameters.json"]);
        expect(response.status).toBe(200);
        expect(response.headers["Content-Type"]).toBe("application/zip");
        expect(response.headers["Content-Disposition"]).toBe('attachment; filename="prosim-st-p2pfin.zip"');
        expect(Buffer.from(response.body).readUInt32LE(0)).toBe(0x04034b50);
    });

    it("refuses unknown samples", async () => {
        expect((await call("../../etc")).status).toBe(404);
        expect(readFile).not.toHaveBeenCalled();
    });

    it("returns 404 and tries again later when a file is missing", async () => {
        (readFile as jest.Mock).mockRejectedValueOnce(new Error("ENOENT")).mockResolvedValue(Buffer.from("content"));
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});

        expect((await call("bpic2017")).status).toBe(404);
        expect((await call("bpic2017")).status).toBe(200);
        logSpy.mockRestore();
    });
});
