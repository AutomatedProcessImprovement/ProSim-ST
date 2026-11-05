import axios from "axios";
import {readdir, stat, unlink} from "fs/promises";
import {basename, join} from "path";
import {DataSource} from "typeorm";
import {Process} from "./entities/Process";
import {Event} from "./entities/Event";
import {Frame} from "./entities/Frame";

const HOUR = 60 * 60 * 1000;

export type CleanupOptions = {
    retentionDays: number;
    pythonBaseUrl: string;
    assetsDir: string;
    orphanAgeHours?: number;
    now?: Date;
};

export type CleanupResult = {
    deleted: string[];
    failed: string[];
    orphanAssets: string[];
    orphanRuns: string[];
};

const removeFile = (path: string) => unlink(path).catch(error => {
    if (error?.code !== "ENOENT") throw error;
});

export async function cleanupOldProcesses(dataSource: DataSource, options: CleanupOptions): Promise<CleanupResult> {
    const now = options.now ?? new Date();
    const orphanAgeMs = (options.orphanAgeHours ?? 48) * HOUR;
    const cutoff = new Date(now.getTime() - options.retentionDays * 24 * HOUR);
    const repository = dataSource.getRepository(Process);

    const expired = await repository.createQueryBuilder("process")
        .where("process.lastAccessedAt < :cutoff OR process.setToDelete = :setToDelete", {cutoff, setToDelete: true})
        .getMany();

    if (expired.length) {
        await repository.createQueryBuilder()
            .update(Process)
            .set({setToDelete: true})
            .where("id IN (:...ids)", {ids: expired.map(process => process.id)})
            .execute();
    }

    const deleted: string[] = [];
    const failed: string[] = [];
    for (const process of expired) {
        try {
            await axios.delete(`${options.pythonBaseUrl}/delete/${encodeURIComponent(process.id)}`);
            await dataSource.transaction(async manager => {
                await manager.delete(Event, {processId: process.id});
                await manager.delete(Frame, {processId: process.id});
                await manager.delete(Process, {id: process.id});
            });
            await removeFile(join(options.assetsDir, basename(process.fileName)));
            deleted.push(process.id);
        } catch (error) {
            console.error(`[cleanup] Could not delete ${process.id}:`, error?.message ?? error);
            failed.push(process.id);
        }
    }

    const remaining = await repository.find({select: {id: true, fileName: true}});
    const keptFiles = new Set(remaining.map(process => basename(process.fileName)));

    const orphanAssets: string[] = [];
    const files = await readdir(options.assetsDir).catch(() => [] as string[]);
    for (const file of files) {
        if (!file.endsWith(".bpmn") || keptFiles.has(file)) continue;
        const path = join(options.assetsDir, file);
        const {mtimeMs} = await stat(path);
        if (now.getTime() - mtimeMs < orphanAgeMs) continue;
        await removeFile(path);
        orphanAssets.push(file);
    }

    const pruned = await axios.post(`${options.pythonBaseUrl}/prune`, {
        keep: remaining.map(process => process.id),
        min_age_hours: orphanAgeMs / HOUR,
    });

    return {deleted, failed, orphanAssets, orphanRuns: pruned.data?.removed ?? []};
}
