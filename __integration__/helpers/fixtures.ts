import {DataSource} from 'typeorm';
import {LifecycleTypes} from '../../definitions/simulation/enums';

export type EventSeed = {
    caseId: number;
    lifecycle: LifecycleTypes;
    timestamp: string;
    nodeId: string;
    paths: object;
    processId: string;
};

export type FrameSeed = {
    caseId: number;
    activeElements: object;
    processId: string;
};

export const seedProcess = async (
    dataSource: DataSource,
    opts: {
        id: string;
        fileName?: string;
        startDate: string;
        endDate: string;
        setToDelete?: boolean;
    }
): Promise<void> => {
    await dataSource.query(
        `INSERT INTO process (id, fileName, startDate, endDate, setToDelete)
         VALUES (?, ?, ?, ?, ?)`,
        [opts.id, opts.fileName ?? 'test.bpmn', opts.startDate, opts.endDate, opts.setToDelete ? 1 : 0]
    );
};

export const seedEvents = async (
    dataSource: DataSource,
    events: EventSeed[]
): Promise<void> => {
    for (const event of events) {
        await dataSource.query(
            `INSERT INTO event (caseId, lifecycle, timestamp, nodeId, paths, processId)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [event.caseId, event.lifecycle, event.timestamp, event.nodeId, JSON.stringify(event.paths), event.processId]
        );
    }
};

export const seedFrames = async (
    dataSource: DataSource,
    frames: FrameSeed[]
): Promise<void> => {
    for (const frame of frames) {
        await dataSource.query(
            `INSERT INTO frame (caseId, activeElements, processId)
             VALUES (?, ?, ?)`,
            [frame.caseId, JSON.stringify(frame.activeElements), frame.processId]
        );
    }
};

// Produces a UTC datetime string like "2024-01-01 02:00:00" offset by `hours` from base
export const ts = (base: Date, hours: number): string => {
    const d = new Date(base.getTime() + hours * 3_600_000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
};
