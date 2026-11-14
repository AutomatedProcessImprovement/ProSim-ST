import {inflateRawSync} from "zlib";
import {zip} from "@utils/zip";

const read = (archive: Buffer) => {
    const end = archive.length - 22;
    expect(archive.readUInt32LE(end)).toBe(0x06054b50);
    const files: Record<string, string> = {};
    let at = archive.readUInt32LE(end + 16);
    for (let i = 0; i < archive.readUInt16LE(end + 10); i++) {
        expect(archive.readUInt32LE(at)).toBe(0x02014b50);
        const nameLength = archive.readUInt16LE(at + 28);
        const name = archive.subarray(at + 46, at + 46 + nameLength).toString();
        const local = archive.readUInt32LE(at + 42);
        const start = local + 30 + archive.readUInt16LE(local + 26);
        files[name] = inflateRawSync(archive.subarray(start, start + archive.readUInt32LE(at + 20))).toString();
        at += 46 + nameLength;
    }
    return files;
};

describe("zip", () => {
    it("packs files that can be read back", () => {
        const archive = zip([
            {name: "sample/log.csv", content: Buffer.from("CaseId,Activity\n1,A\n".repeat(50))},
            {name: "sample/model.bpmn", content: Buffer.from("<definitions/>")},
        ], new Date(2026, 10, 14, 10, 30));
        expect(read(archive)).toEqual({
            "sample/log.csv": "CaseId,Activity\n1,A\n".repeat(50),
            "sample/model.bpmn": "<definitions/>",
        });
    });
});
