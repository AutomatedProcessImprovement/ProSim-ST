import {crc32, deflateRawSync} from "zlib";

export type ZipEntry = {name: string; content: Buffer};

const dosTime = (date: Date) => (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
const dosDate = (date: Date) => ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

export const zip = (entries: ZipEntry[], modified = new Date()): Buffer => {
    const parts: Buffer[] = [];
    const directory: Buffer[] = [];
    let offset = 0;

    for (const {name, content} of entries) {
        const fileName = Buffer.from(name, "utf8");
        const compressed = deflateRawSync(content);
        const fields = (header: Buffer, at: number) => {
            header.writeUInt16LE(20, at);
            header.writeUInt16LE(0x0800, at + 2);
            header.writeUInt16LE(8, at + 4);
            header.writeUInt16LE(dosTime(modified), at + 6);
            header.writeUInt16LE(dosDate(modified), at + 8);
            header.writeUInt32LE(crc32(content), at + 10);
            header.writeUInt32LE(compressed.length, at + 14);
            header.writeUInt32LE(content.length, at + 18);
            header.writeUInt16LE(fileName.length, at + 22);
        };

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        fields(local, 4);
        parts.push(local, fileName, compressed);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        fields(central, 6);
        central.writeUInt32LE(offset, 42);
        directory.push(central, fileName);

        offset += local.length + fileName.length + compressed.length;
    }

    const size = directory.reduce((total, part) => total + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...parts, ...directory, end]);
};
