import {NextResponse} from "next/server";
import axios from "axios";
import {randomUUID} from "crypto";
import {readFile, unlink, writeFile} from "fs/promises";
import path from "path";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {saveSimulation, simulatorError} from "@db/mysql/simulationStore";
import {Process} from "@db/entities/Process";
import {Scenario} from "@db/entities/Scenario";
import {
    Comparison,
    mapPyBatchEvent,
    mapPyFrameCase,
    PyBatchEvent,
    PyFrameCase,
    ScenarioEdits,
    WhatIfOptions,
} from "@definitions/api/types";
import {activeJobCount, createJob, failJob, MAX_ACTIVE_JOBS} from "@utils/simulationJobs";
import {changedEdits, describeEdits, hasEdits, parseEdits} from "@utils/scenario";

type BaseRun = {
    id: string;
    fileName: string;
    startDate: string;
    endDate: string;
    utcOffset: string | null;
};

const notFound = () => NextResponse.json({error: "This simulation is no longer available."}, {status: 404});

const findBaseRun = async (id: string): Promise<BaseRun | null> => {
    const dataSource = await createMySQLConnection();
    const scenario = await dataSource.getRepository(Scenario).findOne({select: {baseProcessId: true}, where: {processId: id}});
    const run = await dataSource.getRepository(Process).createQueryBuilder("process")
        .select([
            "process.id AS id",
            "process.fileName AS fileName",
            "CAST(process.startDate AS CHAR) AS startDate",
            "CAST(process.endDate AS CHAR) AS endDate",
            "process.utcOffset AS utcOffset",
            "process.setToDelete AS setToDelete",
        ])
        .where("process.id = :id", {id: scenario?.baseProcessId ?? id})
        .getRawOne();
    return run && !run.setToDelete ? run : null;
};

const fetchOptions = async (base: BaseRun): Promise<WhatIfOptions | null> => {
    try {
        const {data} = await axios.get(`${process.env.PYTHON_MICROSERVICE_BASE_URL}/what-if/${encodeURIComponent(base.id)}`);
        const dataSource = await createMySQLConnection();
        const scenarios = await dataSource.getRepository(Scenario).find({
            select: {processId: true, label: true},
            where: {baseProcessId: base.id},
            order: {createdAt: "DESC"},
        });
        return {
            ...data,
            baseProcessId: base.id,
            scenarios: scenarios.map(({processId, label}) => ({id: processId, label})),
        };
    } catch (error) {
        if (error?.response?.status === 404) return null;
        throw error;
    }
};

export const GET = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse<WhatIfOptions | {error: string}>> => {
    try {
        const {id} = await context.params;
        const base = await findBaseRun(id);
        const options = base && await fetchOptions(base);
        return options ? NextResponse.json(options) : notFound();
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: "Failed to load the what-if options."}, {status: 500});
    }
}

export const POST = async (
    request: Request,
    context: { params: Promise<{ id: string }> }
): Promise<NextResponse> => {
    try {
        const {id} = await context.params;
        const requested = parseEdits(await request.json().catch(() => null));
        if (!requested) return NextResponse.json({error: "The changes could not be read."}, {status: 400});

        const base = await findBaseRun(id);
        const options = base && await fetchOptions(base);
        if (!options) return notFound();
        if (!options.supported) {
            return NextResponse.json(
                {error: "This simulation was created before what-if runs existed. Run it again to use them."},
                {status: 409},
            );
        }

        const edits = changedEdits(requested, options);
        if (!hasEdits(edits)) return NextResponse.json({error: "Change something first."}, {status: 400});

        const label = describeEdits(edits, options);
        const earlier = options.scenarios.find(scenario => scenario.label === label);
        if (earlier) return NextResponse.json({id: earlier.id, existing: true}, {status: 200});

        if (activeJobCount() >= MAX_ACTIVE_JOBS) {
            return NextResponse.json(
                {error: "The simulator is busy with other runs. Please try again in a few minutes."},
                {status: 429},
            );
        }

        const scenarioId = randomUUID();
        const dir = path.join(process.cwd(), "public/assets");
        const assetPath = path.join(dir, `${scenarioId}_${base.fileName.slice(base.id.length + 1)}`);
        await writeFile(assetPath, await readFile(path.join(dir, path.basename(base.fileName))));

        createJob(scenarioId);
        void runScenario(scenarioId, base, edits, label, assetPath);

        return NextResponse.json({id: scenarioId}, {status: 202});
    } catch (error) {
        console.error(error);
        return NextResponse.json({error: "Failed to start the what-if run."}, {status: 500});
    }
}

const runScenario = async (id: string, base: BaseRun, edits: ScenarioEdits, label: string, assetPath: string) => {
    let response: {events: PyBatchEvent[]; frames: PyFrameCase[]; comparison: Comparison};
    try {
        const {data} = await axios.post(`${process.env.PYTHON_MICROSERVICE_BASE_URL}/scenario`, {
            process_id: id,
            base_process_id: base.id,
            edits: {
                pools: edits.pools,
                arrival_percent: edits.arrivalPercent,
                tasks: edits.tasks,
                empty_start: Boolean(edits.emptyStart),
            },
        });
        response = data;
    } catch (error) {
        console.error(`What-if ${id} failed:`, error?.response?.data ?? error?.message ?? error);
        failJob(id, simulatorError(error));
        await unlink(assetPath).catch(() => {});
        return;
    }

    await saveSimulation({
        id,
        window: {
            startDate: new Date(base.startDate + "Z"),
            endDate: new Date(base.endDate + "Z"),
            utcOffset: base.utcOffset ?? "+00:00",
        },
        data: {
            events: response.events.map(mapPyBatchEvent),
            frames: response.frames.map(mapPyFrameCase),
        },
    }, assetPath, {baseProcessId: base.id, label, edits, comparison: response.comparison});
};
