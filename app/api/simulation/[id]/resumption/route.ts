import {NextResponse} from "next/server";
import {
    mapPyFrameCase,
    PyFrameCase,
    ResumeSimulationRequestBodyPython,
    ResumeSimulationResponse
} from "@definitions/api/types";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {formatDateString, getHourDifference} from "@utils/dateHelpers";
import {BatchEvent, CaseTimes, FrameCase, WTPTState} from "@definitions/simulation/types";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {groupEvents} from "@utils/events";
import axios from "axios";

export const POST = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<ResumeSimulationResponse | {error: string}>> => {
    try {
        const { requestedDate } = await request.json();
        const params = await context.params;
        const processId = params.id;
        const limit = 15;
        const startDate = new Date(requestedDate);
        const appDataSource = await createMySQLConnection();
        const processRepository = appDataSource.getRepository(Process);

        const simulationProcess = await processRepository
            .createQueryBuilder("process")
            .select([
                "process.id AS id",
                "process.fileName AS fileName",
                "CAST(process.endDate AS CHAR) AS endDate",
                "CAST(process.startDate AS CHAR) AS startDate",
                "process.setToDelete AS setToDelete"
            ])
            .where("process.id = :id", { id: processId })
            .getRawOne();

        if (!simulationProcess) {
            return NextResponse.json({ error: "Process not found" }, { status: 404 });
        }

        if (simulationProcess.setToDelete) {
            return NextResponse.json({ error: "Process is marked for deletion" }, { status: 410 });
        }

        // Update lastAccessedAt
        await processRepository.update({ id: processId }, { lastAccessedAt: new Date() });

        const simulationStartDate = new Date(simulationProcess.startDate + "Z");
        const simulationFinishDate = new Date(simulationProcess.endDate + "Z");

        const finishedCasesResult = await appDataSource
            .createQueryBuilder(Event, "event")
            .where("event.processId = :processId", { processId })
            .andWhere("event.lifecycle = :lifecycle", { lifecycle: LifecycleTypes.CASE_END })
            .andWhere("event.timestamp <= :requestedDate", { requestedDate: formatDateString(startDate) })
            .select("COUNT(DISTINCT event.caseId)", "count")
            .getRawOne();
        const finishedCasesNumber = parseInt(finishedCasesResult.count, 10);

        const wtptEvents: Array<{
            nodeId: string;
            caseId: number;
            lifecycle: LifecycleTypes;
            timestamp: string;
        }> = await appDataSource.query(`
            SELECT 
                event.nodeId AS nodeId,
                event.caseId AS caseId,
                event.lifecycle AS lifecycle,
                CAST(event.timestamp AS CHAR) AS timestamp
            FROM event
            WHERE event.processId = ?
                AND event.timestamp <= ?
                AND event.lifecycle IN (?, ?, ?)
                AND event.nodeId IS NOT NULL
            ORDER BY 
                event.timestamp ASC,
                FIELD(event.lifecycle, 'ENABLE', 'START', 'COMPLETE') ASC,
                event.id ASC
        `, [
            processId,
            formatDateString(startDate),
            LifecycleTypes.ENABLE,
            LifecycleTypes.START,
            LifecycleTypes.COMPLETE,
        ]);

        const wtpt = buildWTPTState(wtptEvents);

        if (startDate >= simulationFinishDate) {
            return NextResponse.json({
                frames: [],
                batches: [],
                finishedCasesNumber,
                wtpt,
                pointer: -1,
            }, { status: 200 });
        }

        const rawEndDate = new Date(requestedDate);
        rawEndDate.setMinutes(0, 0, 0);
        rawEndDate.setHours(rawEndDate.getHours() + limit);
        const endDate = rawEndDate < simulationFinishDate ? rawEndDate : simulationFinishDate;
        const simulationHasFinished = endDate === simulationFinishDate;
        const endDateOperator = simulationHasFinished ? "<=" : "<";

        const events: Event[] = await appDataSource.query(`
            SELECT *, CAST(timestamp AS CHAR) AS timestamp
            FROM event
            WHERE processId = ? AND event.timestamp >= ? AND event.timestamp ${endDateOperator} ?
        `, [
            processId,
            formatDateString(startDate),
            formatDateString(endDate),
        ]);
        const batchEvents: Array<BatchEvent> = events.map(event => ({
            caseId: event.caseId,
            lifecycle: event.lifecycle as LifecycleTypes,
            timestamp: event.timestamp,
            nodeId: event.nodeId,
            paths: event.paths,
        }));
        const batches = groupEvents(batchEvents, startDate.toISOString(), endDate.toISOString());

        const reqBody: ResumeSimulationRequestBodyPython = {
            process_id: processId,
            timestamp: requestedDate,
        }
        const response = await axios.post(
            process.env.PYTHON_MICROSERVICE_BASE_URL + `/resumption`,
            reqBody,
            { headers: { "Content-Type": "application/json" } }
        )
        const pyFrames = (response.data as { frames: Array<PyFrameCase> }).frames;
        const frames: FrameCase[] = pyFrames.map(mapPyFrameCase);

        // Repair the tokens to match the ongoing precomputed events

        const previousEvents: Event[] = await appDataSource.query(`
            SELECT 
                event.timestamp, 
                event.caseId, 
                event.paths,
                CAST(event.timestamp AS CHAR) AS timestamp
            FROM event
            WHERE processId = ? AND event.timestamp < ?
        `, [
            processId,
            formatDateString(startDate),
        ]);

        frames.forEach(frame => {
            const caseId = frame.caseId;
            const activeElements = frame.activeElements;
            const previousCaseEvents = previousEvents.filter(event => event.caseId === caseId);

            const repairedActiveTokens = {};
            const repairedTokenIds = new Set();

            Object.entries(activeElements).forEach(([activeElementTokenId, elementId]) => {
                const previousTokenPath: [string, string][] = [];

                previousCaseEvents.forEach(previousEvent => {
                    const previousEventPaths: { [p: string]: Array<string> } = previousEvent.paths;
                    Object.entries(previousEventPaths).forEach(([previousEventTokenId, path]) => {
                        if (path.includes(elementId)) {
                            previousTokenPath.push([previousEventTokenId, path[path.length - 1]])
                        }
                    });
                });

                if (previousTokenPath.length > 0) {
                    const [ realTokenId, realFlow ] = previousTokenPath[previousTokenPath.length - 1];
                    repairedActiveTokens[realTokenId] = realFlow;
                    repairedTokenIds.add(activeElementTokenId);
                }
            });

            const unrepairedTokenIds = Object.keys(activeElements)
                .filter(tokenId => !repairedTokenIds.has(tokenId));
            const availableNewTokenIds = Object.keys(activeElements)
                .filter(tokenId => !(tokenId in repairedActiveTokens)).sort();

            unrepairedTokenIds.map(unrepairedTokenId =>
                activeElements[unrepairedTokenId]
            ).sort((a, b) => b.localeCompare(a)).forEach(activeElement => {
                const newTokenId = availableNewTokenIds.pop();
                if (newTokenId !== undefined) {
                    repairedActiveTokens[newTokenId] = activeElement;
                }
            });

            frame.activeElements = repairedActiveTokens;
        });

        return NextResponse.json({
            frames,
            batches,
            finishedCasesNumber,
            wtpt,
            pointer: simulationHasFinished ? -1 : getHourDifference(simulationStartDate, endDate),
        }, { status: 200 });
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}

function buildWTPTState(events: Array<{
    nodeId: string;
    caseId: number;
    lifecycle: LifecycleTypes;
    timestamp: string;
}>): WTPTState {
    const state: WTPTState = {};

    for (const ev of events) {
        const nodeId = ev.nodeId;
        const caseId = ev.caseId;

        if (!nodeId) continue;

        const ts = new Date(ev.timestamp + "Z").getTime();

        if (!state[nodeId]) {
            state[nodeId] = {
                name: nodeId, // name will be overridden client-side from BPMN map anyway
                averageWT: 0,
                averagePT: 0,
                _count: 0,
                incompleteCases: {},
            };
        }

        const nodeState = state[nodeId];
        const prevCase: CaseTimes = nodeState.incompleteCases?.[caseId] ?? {};

        if (ev.lifecycle === LifecycleTypes.ENABLE) {
            nodeState.incompleteCases[caseId] = {
                ...prevCase,
                enablementTime: ts,
            };
            continue;
        }

        if (ev.lifecycle === LifecycleTypes.START) {
            if (prevCase.enablementTime == null) continue; // ignore START without ENABLE
            nodeState.incompleteCases[caseId] = {
                ...prevCase,
                startTime: ts,
            };
            continue;
        }

        if (ev.lifecycle === LifecycleTypes.COMPLETE) {
            if (prevCase.enablementTime == null || prevCase.startTime == null) continue; // ignore COMPLETE without ENABLE+START
            const nextCase: CaseTimes = {
                ...prevCase,
                endTime: ts,
            };

            const wt = nextCase.startTime - nextCase.enablementTime;
            const pt = nextCase.endTime - nextCase.startTime;

            if (wt < 0 || pt < 0) {
                continue;
            }

            const n = nodeState._count ?? 0;
            nodeState.averageWT = (nodeState.averageWT * n + wt) / (n + 1);
            nodeState.averagePT = (nodeState.averagePT * n + pt) / (n + 1);
            nodeState._count = n + 1;

            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [caseId]: _removed, ...rest } = nodeState.incompleteCases;
            nodeState.incompleteCases = rest;
        }
    }

    return state;
}