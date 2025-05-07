import {NextResponse} from "@node_modules/next/server";
import {ResumeSimulationRequestBodyPython, ResumeSimulationResponse} from "@definitions/api/types";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {formatDateString, getHourDifference} from "@utils/dateHelpers";
import {BatchEvent, FrameCase} from "@definitions/simulation/types";
import {LifecycleTypes} from "@definitions/simulation/enums";
import {groupEvents} from "@utils/events";
import axios from "axios";

export const POST = async (
    request: Request,
    context: { params: { id: string } }
): Promise<NextResponse<ResumeSimulationResponse | {error: string}>> => {
    try {
        const { requestedDate } = await request.json();
        const params = await context.params;
        const processId = params.id;
        const limit = 15;

        const appDataSource = await createMySQLConnection();
        const processRepository = appDataSource.getRepository(Process);

        const simulationProcess = await processRepository
            .createQueryBuilder("process")
            .select([
                "process.id AS id",
                "process.fileName AS fileName",
                "CAST(process.endDate AS CHAR) AS endDate",
                "CAST(process.startDate AS CHAR) AS startDate"
            ])
            .where("process.id = :id", { id: processId })
            .getRawOne();
        const simulationStartDate = new Date(simulationProcess.startDate + "Z");
        const simulationFinishDate = new Date(simulationProcess.endDate + "Z");

        const startDate = new Date(requestedDate);
        if (startDate >= simulationFinishDate) {
            return NextResponse.json({
                frames: [],
                batches: [],
                pointer: -1
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
            WHERE processId = ? AND timestamp >= ? AND timestamp ${endDateOperator} ?
        `, [
            processId,
            formatDateString(startDate),
            formatDateString(endDate),
        ]);
        const batchEvents: Array<BatchEvent> = events.map(event => ({
            case_id: event.caseId,
            lifecycle: event.lifecycle as LifecycleTypes,
            timestamp: event.timestamp,
            node_id: event.nodeId,
            paths: JSON.parse(event.paths),
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
        const frames: FrameCase[] = response.data.frames;

        // Repair the tokens to match the ongoing precomputed events

        const previousEvents: Event[] = await appDataSource.query(`
            SELECT 
                event.timestamp, 
                event.caseId, 
                event.paths,
                CAST(timestamp AS CHAR) AS timestamp
            FROM event
            WHERE processId = ? AND timestamp < ?
        `, [
            processId,
            formatDateString(startDate),
        ]);

        frames.forEach(frame => {
            const caseId = frame.case_id;
            const activeElements = frame.active_elements;
            const previousCaseEvents = previousEvents.filter(event => event.caseId === caseId);

            const repairedActiveTokens = {};
            const repairedTokenIds = new Set();

            Object.entries(activeElements).forEach(([activeElementTokenId, elementId]) => {
                const previousTokenPath: [string, string][] = [];

                previousCaseEvents.forEach(previousEvent => {
                    const previousEventPaths: { [p: string]: Array<string> } = JSON.parse(previousEvent.paths);
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
                .filter(tokenId => !(tokenId in repairedActiveTokens));

            unrepairedTokenIds.forEach(unrepairedTokenId => {
                const newTokenId = availableNewTokenIds.pop();
                if (newTokenId !== undefined) {
                    repairedActiveTokens[newTokenId] = activeElements[unrepairedTokenId];
                }
            });

            frame.active_elements = repairedActiveTokens;
        });

        return NextResponse.json({
            frames,
            batches,
            pointer: simulationHasFinished ? -1 : getHourDifference(simulationStartDate, endDate),
        }, { status: 200 });
    } catch (error) {
        console.log(error)
        return NextResponse.json({ error: "Failed to get simulation data." }, { status: 500 });
    }
}
