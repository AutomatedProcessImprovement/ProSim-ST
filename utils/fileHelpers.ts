export const readLines = async (
    file: File,
    options?: {
        lines?: number,
        removeWhite?: boolean
    }
): Promise<string[]> => {
    const reader = new FileReader();

    return new Promise<string[]>((resolve, reject) => {
        reader.onerror = () => {
            reader.abort();
            reject(`Error while parsing file ${file.name}.`);
        }

        reader.onabort = () => {
            reader.abort();
            reject(`Error while parsing file ${file.name}.`);
        }

        reader.onload = () => {
            let content = (options?.lines && options?.lines > 0)
                ? (reader.result as string).split(/\r\n|\r|\n/, options.lines)
                : (reader.result as string).split(/\r\n|\r|\n/);

            if (options?.removeWhite) {
                content = content.filter(line => line.length !== 0);
            }

            resolve(content);
        }

        reader.readAsText(file);
    });
}

export const readText = (file: Blob) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
});

export class LogFileError extends Error {}

const DELIMITERS = [",", ";", "\t", "|"];

export const detectDelimiter = (header = "") => {
    const counts = DELIMITERS.map(delimiter => header.split(delimiter).length - 1);
    const best = counts.indexOf(Math.max(...counts));
    return counts[best] > 0 ? DELIMITERS[best] : ",";
};

export const splitCsvLine = (line = "", delimiter = ",") => {
    if (!line.includes('"')) return line.split(delimiter).map(cell => cell.trim());
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (quoted) {
            if (char === '"' && line[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (char === '"') {
                quoted = false;
            } else {
                cell += char;
            }
        } else if (char === '"') {
            quoted = true;
        } else if (char === delimiter) {
            cells.push(cell.trim());
            cell = "";
        } else {
            cell += char;
        }
    }
    cells.push(cell.trim());
    return cells;
};

export const splitLogLines = (lines: string[]) => {
    const delimiter = detectDelimiter(lines[0]);
    return {delimiter, split: (line: string) => splitCsvLine(line, delimiter)};
};

export async function parseCsvFile(file: File){
    const lines = await readLines(file, { removeWhite: true });
    if (!lines.length) throw new LogFileError("The file is empty.");
    const head = lines.slice(0, 50).join("\n").slice(0, 8192);
    const unreadable = (head.match(/[\u0000-\u0008\u000e-\u001f\ufffd]/g) ?? []).length;
    if (head.startsWith("PK\u0003\u0004") || unreadable > head.length * 0.02) {
        throw new LogFileError("This is not a text CSV file. If it is an Excel workbook, save it as CSV (comma-separated) first.");
    }
    if (/^\s*</.test(lines[0] ?? "")) {
        throw new LogFileError("This file is not a CSV log: it looks like HTML or XML.");
    }
    const {delimiter, split} = splitLogLines(lines);
    const fileHeaders = split(lines[0]);
    if (fileHeaders.length < 2 || !lines[0].includes(delimiter)) {
        throw new LogFileError("Only one column was found. The columns of the log must be separated by commas or semicolons.");
    }
    if (lines.length < 2) throw new LogFileError("The log has a header row but no events.");

    return {
        fileHeaders,
        fileFirstLine: split(lines[1]),
        fileLastLine: split(lines[lines.length - 1]),
    };
}

export const getLogUtcOffset = (raw?: string) => {
    const match = raw?.trim().match(/([+-])(\d{2}):?(\d{2})$/);
    if (!match || !/\d[T ]\d/.test(raw)) return "+00:00";

    return `${match[1]}${match[2]}:${match[3]}`;
};

