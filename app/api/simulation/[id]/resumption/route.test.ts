import {mockJsonResponse, createQueryBuilderMock} from "../../../testHelpers";

jest.mock("next/server", () => ({
    NextResponse: {
        json: jest.fn((body, init) => mockJsonResponse(body, init)),
    },
}));

jest.mock("@db/mysql/typeorm", () => ({
    createMySQLConnection: jest.fn(),
}));

jest.mock("axios", () => ({
    post: jest.fn(),
}));

jest.mock("@utils/events", () => ({
    groupEvents: jest.fn(),
}));

jest.mock("@utils/wtpt", () => ({
    buildWTPTState: jest.fn(),
}));

jest.mock("@utils/dateHelpers", () => ({
    formatDateString: jest.fn((date: Date) => date.toISOString().slice(0, 19).replace("T", " ")),
    getHourDifference: jest.fn(() => 7),
}));

import {POST} from "./route";
import {createMySQLConnection} from "@db/mysql/typeorm";
import axios from "axios";
import {groupEvents} from "@utils/events";
import {buildWTPTState} from "@utils/wtpt";
import {Process} from "@db/entities/Process";
import {LifecycleTypes} from "@definitions/simulation/enums";

describe("POST /api/simulation/[id]/resumption", () => {
    const processRepository = {
        createQueryBuilder: jest.fn(),
        update: jest.fn(),
    };
    const finishedCasesBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        getRawOne: jest.fn(),
    };

    beforeEach(() => {
        jest.clearAllMocks();
        finishedCasesBuilder.where.mockReturnThis();
        finishedCasesBuilder.andWhere.mockReturnThis();
        finishedCasesBuilder.select.mockReturnThis();
    });

    const buildRequest = (requestedDate: string) => ({
        json: jest.fn().mockResolvedValue({requestedDate}),
    }) as unknown as Request;

    it("returns 404 when the process does not exist", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock(null));
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn(() => processRepository),
        });

        const response = await POST(buildRequest("2024-01-01T01:00:00.000Z"), {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Process not found"}, status: 404});
    });

    it("returns 410 when the process is marked for deletion", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            fileName: "file.bpmn",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-01 02:00:00",
            setToDelete: true,
        }));
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn(() => processRepository),
        });

        const response = await POST(buildRequest("2024-01-01T01:00:00.000Z"), {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Process is marked for deletion"}, status: 410});
    });

    it("returns an early completed response when requested date is past the simulation end", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            fileName: "file.bpmn",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-01 02:00:00",
            setToDelete: false,
        }));
        finishedCasesBuilder.getRawOne.mockResolvedValue({count: "3"});
        (buildWTPTState as jest.Mock).mockReturnValue({Task_A: {name: "Task_A"}});
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepository;
                throw new Error("unexpected repository");
            }),
            createQueryBuilder: jest.fn(() => finishedCasesBuilder),
            query: jest.fn().mockResolvedValue([{nodeId: "Task_A", caseId: 1, lifecycle: LifecycleTypes.START, timestamp: "2024-01-01 01:00:00"}]),
        });

        const response = await POST(buildRequest("2024-01-01T03:00:00.000Z"), {
            params: Promise.resolve({id: "p1"}),
        });

        expect(processRepository.update).toHaveBeenCalled();
        expect(buildWTPTState).toHaveBeenCalled();
        expect(axios.post).not.toHaveBeenCalled();
        expect(response).toEqual({
            body: {
                frames: [],
                batches: [],
                finishedCasesNumber: 3,
                wtpt: {Task_A: {name: "Task_A"}},
                pointer: -1,
            },
            status: 200,
        });
    });

    it("returns repaired frames, grouped batches, and a pointer for an in-progress resumption", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            fileName: "file.bpmn",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-02 10:00:00",
            setToDelete: false,
        }));
        finishedCasesBuilder.getRawOne.mockResolvedValue({count: "2"});
        (buildWTPTState as jest.Mock).mockReturnValue({Task_A: {name: "Task_A"}});
        (groupEvents as jest.Mock).mockReturnValue([{events: [], startDate: "a", endDate: "b"}]);
        (axios.post as jest.Mock).mockResolvedValue({
            data: {
                frames: [{case_id: 1, active_elements: {ghostToken: "Task_A", freeToken: "Task_Z"}}],
            },
        });
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepository;
                throw new Error("unexpected repository");
            }),
            createQueryBuilder: jest.fn(() => finishedCasesBuilder),
            query: jest
                .fn()
                .mockResolvedValueOnce([{nodeId: "Task_A", caseId: 1, lifecycle: LifecycleTypes.START, timestamp: "2024-01-01 01:00:00"}])
                .mockResolvedValueOnce([
                    {
                        caseId: 1,
                        lifecycle: LifecycleTypes.START,
                        timestamp: "2024-01-01 10:30:00",
                        nodeId: "Task_A",
                        paths: {ghostToken: ["Flow_1", "Task_A"]},
                    },
                ])
                .mockResolvedValueOnce([
                    {
                        caseId: 1,
                        timestamp: "2024-01-01 09:30:00",
                        paths: {realToken: ["Flow_1", "Task_A"]},
                    },
                ]),
        });

        const response = await POST(buildRequest("2024-01-01T10:00:00.000Z"), {
            params: Promise.resolve({id: "p1"}),
        });

        expect(groupEvents).toHaveBeenCalled();
        expect(axios.post).toHaveBeenCalledWith(
            expect.stringContaining("/resumption"),
            {process_id: "p1", timestamp: "2024-01-01T10:00:00.000Z"},
            {headers: {"Content-Type": "application/json"}},
        );
        expect(response).toEqual({
            body: {
                frames: [{caseId: 1, activeElements: {realToken: "Task_A", ghostToken: "Task_Z"}}],
                batches: [{events: [], startDate: "a", endDate: "b"}],
                finishedCasesNumber: 2,
                wtpt: {Task_A: {name: "Task_A"}},
                pointer: 7,
            },
            status: 200,
        });
    });

    it("returns pointer -1 when the resumed window reaches the simulation finish", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            fileName: "file.bpmn",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-01 12:00:00",
            setToDelete: false,
        }));
        finishedCasesBuilder.getRawOne.mockResolvedValue({count: "1"});
        (buildWTPTState as jest.Mock).mockReturnValue({});
        (groupEvents as jest.Mock).mockReturnValue([]);
        (axios.post as jest.Mock).mockResolvedValue({
            data: {
                frames: [{case_id: 1, active_elements: {ghostToken: "Task_A"}}],
            },
        });
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepository;
                throw new Error("unexpected repository");
            }),
            createQueryBuilder: jest.fn(() => finishedCasesBuilder),
            query: jest
                .fn()
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([]),
        });

        const response = await POST(buildRequest("2024-01-01T10:00:00.000Z"), {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({
            body: {
                frames: [{caseId: 1, activeElements: {ghostToken: "Task_A"}}],
                batches: [],
                finishedCasesNumber: 1,
                wtpt: {},
                pointer: -1,
            },
            status: 200,
        });
    });

    it("sorts multiple unrepaired active elements before reassigning available token ids", async () => {
        processRepository.createQueryBuilder.mockReturnValue(createQueryBuilderMock({
            id: "p1",
            fileName: "file.bpmn",
            startDate: "2024-01-01 00:00:00",
            endDate: "2024-01-02 10:00:00",
            setToDelete: false,
        }));
        finishedCasesBuilder.getRawOne.mockResolvedValue({count: "0"});
        (buildWTPTState as jest.Mock).mockReturnValue({});
        (groupEvents as jest.Mock).mockReturnValue([]);
        (axios.post as jest.Mock).mockResolvedValue({
            data: {
                frames: [{
                    case_id: 1,
                    active_elements: {aToken: "Task_B", bToken: "Task_A"},
                }],
            },
        });
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn((entity) => {
                if (entity === Process) return processRepository;
                throw new Error("unexpected repository");
            }),
            createQueryBuilder: jest.fn(() => finishedCasesBuilder),
            query: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]),
        });

        const response = await POST(buildRequest("2024-01-01T10:00:00.000Z"), {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({
            body: {
                frames: [{caseId: 1, activeElements: {bToken: "Task_B", aToken: "Task_A"}}],
                batches: [],
                finishedCasesNumber: 0,
                wtpt: {},
                pointer: 7,
            },
            status: 200,
        });
    });

    it("returns 500 when resumption fails unexpectedly", async () => {
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
        processRepository.createQueryBuilder.mockImplementation(() => {
            throw new Error("db failed");
        });
        (createMySQLConnection as jest.Mock).mockResolvedValue({
            getRepository: jest.fn(() => processRepository),
        });

        const response = await POST(buildRequest("2024-01-01T01:00:00.000Z"), {
            params: Promise.resolve({id: "p1"}),
        });

        expect(response).toEqual({body: {error: "Failed to get simulation data."}, status: 500});
        logSpy.mockRestore();
    });
});



