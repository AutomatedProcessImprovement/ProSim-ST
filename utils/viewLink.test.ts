import {readSharedView, writeSharedView} from "@utils/viewLink";

describe("utils/viewLink", () => {
    it("writes a readable query and reads the same view back", () => {
        const view = {moment: Date.UTC(2024, 0, 2, 3, 4, 5), hoursPerSecond: 6, colorMode: "age" as const, taskId: "Task_1", caseId: 42};
        const query = writeSharedView(view);

        expect(query).toBe("?t=2024-01-02T03:04:05Z&speed=6&colour=age&task=Task_1&case=42");
        expect(readSharedView(query)).toEqual(view);
    });

    it("keeps the origin colouring in the link", () => {
        expect(writeSharedView({colorMode: "origin"})).toBe("?colour=origin");
        expect(readSharedView("?colour=origin")).toEqual({colorMode: "origin"});
    });

    it("keeps the slowest speeds in the link", () => {
        for (const hoursPerSecond of [1 / 60, 1 / 12, 0.25]) {
            expect(readSharedView(writeSharedView({hoursPerSecond}))).toEqual({hoursPerSecond});
        }
    });

    it("leaves out what is at its default", () => {
        expect(writeSharedView({hoursPerSecond: 1, colorMode: "state"})).toBe("");
        expect(readSharedView("")).toEqual({});
    });

    it("ignores values it does not understand", () => {
        expect(readSharedView("?t=soon&speed=7&colour=pink&case=abc&task=")).toEqual({});
        expect(readSharedView("?case=")).toEqual({});
    });
});
