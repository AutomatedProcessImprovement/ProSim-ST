import {mockJsonResponse, createQueryBuilderMock} from "../../../testHelpers";
import {makeEvent} from "@utils/testHelpers";
import {LifecycleTypes} from "@definitions/simulation/enums";

jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((body, init) => mockJsonResponse(body, init)),
    },
}));

jest.mock("@db/mysql/typeorm", () => ({
    createMySQLConnection: jest.fn(),
}));

jest.mock("@utils/events", () => ({
    groupEvents: jest.fn(),
}));

import {GET} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {groupEvents} from "@utils/events";
import {Process} from "@db/entities/Process";

describe("GET /api/simulation/[id]/polling", () => {
    const processRepository = {
        createQueryBuilder: jest.fn(),
        update: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("returns 404 when the process does not exist", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(null));
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn(() => processRepository),
        });

        const response = await GET({url: "http://localhost/api/simulation/p1/polling?pointer=0&limit=10"} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Process not found"}, status: 404});
    });

    it("returns 410 when the process is marked for deletion", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-01 03:00:00",
            setToDelete: true,
        }));
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepository;
                throw new Error("unexpected repository");
            }),
        });

        const response = await GET({url: "http://localhost/api/simulation/p1/polling?pointer=0&limit=10"} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Process is marked for deletion"}, status: 410});
    });

    it("returns pointer -1 when the requested start is beyond the simulation end", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-01 01:00:00",
            setToDelete: false,
        }));
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepository;
                throw new Error("unexpected repository");
            }),
        });

        const response = await GET({url: "http://localhost/api/simulation/p1/polling?pointer=2&limit=10"} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(processRepository.update).toHaveBeenCalled();
        expect(response).toEqual({body: {batches: [], pointer: -1}, status: 200});
    });

    it("returns grouped batches and advances the pointer", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-01 05:00:00",
            setToDelete: false,
        }));
        (groupEvents as jest.Mock).mockReturnValue([{events: [], startDate: "a", endDate: "b"}]);
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepository;
                throw new Error("unexpected repository");
            }),
            query: jest.fn().mockResolvedValue([
                makeEvent({
                    caseId: 1,
                    lifecycle: LifecycleTypes.START,
                    timestamp: "2024-01-01 00:30:00",
                    nodeId: "Task_1",
                    paths: {token: ["Flow_1", "Task_1"]},
                }),
            ]),
        });

        const response = await GET({url: "http://localhost/api/simulation/p1/polling?pointer=1&limit=2"} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(groupEvents).toHaveBeenCalled();
        expect(response).toEqual({
            body: {batches: [{events: [], startDate: "a", endDate: "b"}], pointer: 3},
            status: 200,
        });
    });

    it("uses default pointer and limit values and returns -1 when the fetched window reaches the end", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-01 10:00:00",
            setToDelete: false,
        }));
        (groupEvents as jest.Mock).mockReturnValue([{events: [], startDate: "x", endDate: "y"}]);
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepository;
                throw new Error("unexpected repository");
            }),
            query: jest.fn().mockResolvedValue([]),
        });

        const response = await GET({url: "http://localhost/api/simulation/p1/polling"} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({
            body: {batches: [{events: [], startDate: "x", endDate: "y"}], pointer: -1},
            status: 200,
        });
    });

    it("returns 500 when fetching batches fails unexpectedly", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        processRepository.createQueryBuilder.mockImplementation(() => {
            throw new Error("query failed");
        });
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn(() => processRepository),
        });

        const response = await GET({url: "http://localhost/api/simulation/p1/polling?pointer=1&limit=2"} as Request, {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Failed to fetch batches."}, status: 500});
        logSpy.mockRestore();
    });
});


