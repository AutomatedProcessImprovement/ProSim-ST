import {getRedisInstance, REDIS_KEY_PREFIX_FRAMES} from "@db/redis/redis";
import {unlink} from "fs/promises";
import path from "path";
import {Comparison, ScenarioEdits, SimulationSeedData} from "@definitions/api/types";
import {createMySQLConnection} from "@db/mysql/typeorm";
import {failJob, JobError, setJobStage, SCENARIO_STAGES} from "@utils/simulationJobs";

export type ScenarioRecord = {
    baseProcessId: string;
    label: string;
    edits: ScenarioEdits;
    comparison: Comparison;
};

export const simulatorError = (error): JobError => {
    const detail = error?.response?.data?.detail;
    if (detail && typeof detail === "object" && typeof detail.message === "string") {
        const stage = SCENARIO_STAGES.includes(detail.stage) ? detail.stage : "simulation";
        return detail.input ? {stage, message: detail.message, input: true} : {stage, message: detail.message};
    }
    if (typeof detail === "string") return {stage: "queued", message: detail};
    if (!error?.response) return {stage: "queued", message: "The simulator could not be reached. Please try again later."};
    return {stage: "simulation", message: `The simulator answered with status ${error.response.status}.`};
}

export const saveSimulation = async (simulationData: SimulationSeedData, assetPath: string, scenario?: ScenarioRecord) => {
    const id = simulationData.id;
    setJobStage(id, "saving");
    try {
        await insertSimulationData(simulationData, path.basename(assetPath), scenario);

        const redis = getRedisInstance();
        const redisKey = REDIS_KEY_PREFIX_FRAMES + simulationData.id;
        await redis.set(redisKey, JSON.stringify(simulationData.data.frames), 'EX', 60*60*24);
        redis.disconnect();

        setJobStage(id, "done");
    } catch (error) {
        console.error(`Saving simulation ${id} failed:`, error);
        failJob(id, {stage: "saving", message: "The results could not be saved. Please try again."});
        await unlink(assetPath).catch(() => {});
    }
}

const insertSimulationData = async (
    data: SimulationSeedData,
    fileName: string,
    scenario?: ScenarioRecord,
) => {
    const { id: processId, window, data: { frames } } = data;
    const events = data.data.events.filter(event => new Date(event.timestamp) <= window.endDate);

    const appDataSource = await createMySQLConnection();
    const queryRunner = appDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const processSql = `
            INSERT INTO process (id, fileName, startDate, endDate, utcOffset)
            VALUES (?, ?, ?, ?, ?)
        `;

        let startDate = window.startDate;
        const endDate = window.endDate;
        const eventValues = events.map(event => {
            const eventDate = new Date(event.timestamp);
            if (eventDate < startDate) {
                startDate = eventDate;
            }

            return [
                event.caseId,
                event.lifecycle,
                eventDate.toISOString().slice(0, 19).replace("T", " "),
                event.nodeId,
                JSON.stringify(event.paths),
                processId,
            ]
        });

        const eventPlaceholders = eventValues.map(() => `(?, ?, ?, ?, ?, ?)`).join(", ");

        const eventSql = `
            INSERT INTO event (caseId, lifecycle, timestamp, nodeId, paths, processId)
            VALUES ${eventPlaceholders};
        `;

        const flattenedEventValues = eventValues.flat();

        const frameValues = frames.map(frame => [
            frame.caseId,
            JSON.stringify(frame.activeElements),
            frame.arrivalTime ? new Date(frame.arrivalTime).toISOString().slice(0, 19).replace("T", " ") : null,
            frame.taskTimes ? JSON.stringify(frame.taskTimes) : null,
            processId,
        ]);

        const framePlaceholders = frameValues.map(() => `(?, ?, ?, ?, ?)`).join(", ");

        const frameSql = `
            INSERT INTO frame (caseId, activeElements, arrivalTime, taskTimes, processId)
            VALUES ${framePlaceholders};
        `;

        const flattenedFrameValues = frameValues.flat();

        await queryRunner.query(processSql, [
            processId,
            fileName,
            startDate.toISOString().slice(0, 19).replace("T", " "),
            endDate.toISOString().slice(0, 19).replace("T", " "),
            window.utcOffset,
        ]);
        if (eventValues.length > 0) await queryRunner.query(eventSql, flattenedEventValues);
        if (frameValues.length > 0) await queryRunner.query(frameSql, flattenedFrameValues);
        if (scenario) {
            await queryRunner.query(
                `INSERT INTO scenario (processId, baseProcessId, label, edits, comparison) VALUES (?, ?, ?, ?, ?)`,
                [processId, scenario.baseProcessId, scenario.label, JSON.stringify(scenario.edits), JSON.stringify(scenario.comparison)],
            );
        }

        await queryRunner.commitTransaction();
    } catch (err) {
        console.error("Bulk insert error:", err);
        await queryRunner.rollbackTransaction();
        throw err;
    } finally {
        await queryRunner.release();
    }
}
