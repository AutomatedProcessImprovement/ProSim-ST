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

export async function parseCsvFile(file: File){
    const lines = await readLines(file, { removeWhite: true });

    return {
        fileHeaders: splitCsvLine(lines[0]),
        fileFirstLine: splitCsvLine(lines[1]),
        fileLastLine: splitCsvLine(lines[lines.length - 1]),
    };
}

export const getCellByHeader = (line: string[], headers: string[], headerKey: string) => {
    const idx = headers.indexOf(headerKey);
    if (idx === -1) return undefined;
    return line[idx];
};

export const normalizeLogDate = (raw?: string) => {
    if (!raw) return undefined;

    const isoish =
        raw
            .replace(" ", "T")
            .slice(0, 19) + "+00:00";

    return new Date(isoish).toISOString().slice(0, 19);
};

const splitCsvLine = (line: string) => line.split(/[;,]/);
