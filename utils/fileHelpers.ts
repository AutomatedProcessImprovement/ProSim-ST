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
    const fileHeaders = new Set<string>();

    const lines = await readLines(file, { removeWhite: true });

    for (const word of lines[0].split(',')) {
        fileHeaders.add(word);
    }

    const startLog = new Date(lines[1].split(',')[6].replace(' ', 'T')).toISOString().slice(0, 10);
    const endLog = new Date(lines[lines.length - 1].split(',')[7].replace(' ', 'T')).toISOString().slice(0, 10);

    return { fileHeaders, startLog, endLog };
}
