import axios from "axios";
import {mkdtemp, readdir, utimes, writeFile} from "fs/promises";
import {tmpdir} from "os";
import {join} from "path";
import {cleanupOldProcesses} from "@db/cleanup";
import {Process} from "@db/entities/Process";
import {Event} from "@db/entities/Event";
import {Frame} from "@db/entities/Frame";

jest.mock("axios", () => ({delete: jest.fn(), post: jest.fn()}));

const NOW = new Date("2026-10-31T03:30:00Z");
const HOUR = 3600000;

const touch = async (path: string, ageHours: number) => {
    await writeFile(path, "<bpmn/>");
    const time = new Date(NOW.getTime() - ageHours * HOUR);
    await utimes(path, time, time);
};

function fakeDataSource(expired: Array<{id: string; fileName: string}>, remaining: Array<{id: string; fileName: string}>) {
    const builder = {
        where: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(expired),
        execute: jest.fn().mockResolvedValue({}),
    };
    const manager = {delete: jest.fn()};
    const repository = {
        createQueryBuilder: jest.fn().mockReturnValue(builder),
        find: jest.fn().mockResolvedValue(remaining),
    };
    const dataSource = {
        getRepository: jest.fn(() => repository),
        transaction: jest.fn(async (work: (m: typeof manager) => Promise<void>) => work(manager)),
    };
    return {dataSource, builder, manager};
}

describe("cleanupOldProcesses", () => {
    let assetsDir: string;

    beforeEach(async () => {
        jest.clearAllMocks();
        assetsDir = await mkdtemp(join(tmpdir(), "assets-"));
        (axios.delete as jest.Mock).mockResolvedValue({status: 200});
        (axios.post as jest.Mock).mockResolvedValue({data: {removed: ["gone-run"]}});
    });

    it("deletes runs not opened within the retention period, with their records and files", async () => {
        await touch(join(assetsDir, "old_model.bpmn"), 900);
        await touch(join(assetsDir, "kept_model.bpmn"), 900);
        const {dataSource, builder, manager} = fakeDataSource(
            [{id: "old", fileName: "old_model.bpmn"}],
            [{id: "kept", fileName: "kept_model.bpmn"}],
        );

        const result = await cleanupOldProcesses(dataSource as never, {
            retentionDays: 30, pythonBaseUrl: "http://py", assetsDir, now: NOW,
        });

        expect(builder.where).toHaveBeenCalledWith(
            "process.lastAccessedAt < :cutoff OR process.setToDelete = :setToDelete",
            {cutoff: new Date(NOW.getTime() - 30 * 24 * HOUR), setToDelete: true},
        );
        expect(builder.set).toHaveBeenCalledWith({setToDelete: true});
        expect(axios.delete).toHaveBeenCalledWith("http://py/delete/old");
        expect(manager.delete).toHaveBeenCalledWith(Event, {processId: "old"});
        expect(manager.delete).toHaveBeenCalledWith(Frame, {processId: "old"});
        expect(manager.delete).toHaveBeenCalledWith(Process, {id: "old"});
        expect(await readdir(assetsDir)).toEqual(["kept_model.bpmn"]);
        expect(axios.post).toHaveBeenCalledWith("http://py/prune", {keep: ["kept"], min_age_hours: 48});
        expect(result).toEqual({deleted: ["old"], failed: [], orphanAssets: [], orphanRuns: ["gone-run"]});
    });

    it("keeps a run marked for deletion when the simulator cannot delete it, to retry next time", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        (axios.delete as jest.Mock).mockRejectedValue(new Error("down"));
        const {dataSource, manager} = fakeDataSource([{id: "old", fileName: "old_model.bpmn"}], []);

        const result = await cleanupOldProcesses(dataSource as never, {
            retentionDays: 30, pythonBaseUrl: "http://py", assetsDir, now: NOW,
        });

        expect(manager.delete).not.toHaveBeenCalled();
        expect(result.failed).toEqual(["old"]);
    });

    it("removes uploaded models of no run once they are old enough", async () => {
        await touch(join(assetsDir, "orphan_old.bpmn"), 72);
        await touch(join(assetsDir, "orphan_new.bpmn"), 2);
        await touch(join(assetsDir, "notes.txt"), 72);
        const {dataSource} = fakeDataSource([], []);

        const result = await cleanupOldProcesses(dataSource as never, {
            retentionDays: 30, pythonBaseUrl: "http://py", assetsDir, now: NOW,
        });

        expect(result.orphanAssets).toEqual(["orphan_old.bpmn"]);
        expect((await readdir(assetsDir)).sort()).toEqual(["notes.txt", "orphan_new.bpmn"]);
    });
});
