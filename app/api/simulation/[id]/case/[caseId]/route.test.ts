import {mockJsonResponse} from "../../../../testHelpers";

jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((body, init) => mockJsonResponse(body, init)),
    },
}));

jest.mock("@db/mysql/typeorm", () => ({
    createMySQLConnection: jest.fn(),
}));

import {GET} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";

const call = (caseId: string) =>
    GET({} as Request, {params: Promise.resolve({id: "p1", caseId})});

describe("GET /api/simulation/[id]/case/[caseId]", () => {
    const query = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (createMySQLConnection as jest.Mock).mockResolvedValue({query});
    });

    it("returns the case's events in order, with their paths parsed", async () => {
        query.mockResolvedValue([{lifecycle: "START", nodeId: "Task_A", timestamp: "2024-01-01 00:00:00", paths: '{"t":["Task_A"]}'}]);

        const response = await call("7") as unknown as {body: unknown; status: number};

        expect(response.status).toBe(200);
        expect(response.body).toEqual([{lifecycle: "START", nodeId: "Task_A", timestamp: "2024-01-01 00:00:00", paths: {t: ["Task_A"]}}]);
        expect(query).toHaveBeenCalledWith(expect.stringContaining("caseId = ?"), ["p1", 7]);
    });

    it("refuses anything but a number", async () => {
        const response = await call("7 OR 1=1") as unknown as {status: number};

        expect(response.status).toBe(400);
        expect(query).not.toHaveBeenCalled();
    });

    it("reports a failure as a 500", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        query.mockRejectedValue(new Error("down"));

        expect((await call("7") as unknown as {status: number}).status).toBe(500);
    });
});
