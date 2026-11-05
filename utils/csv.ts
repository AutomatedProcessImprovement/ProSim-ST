type Cell = string | number | null | undefined;

const toCell = (value: Cell) => {
    if (value === null || value === undefined) return "";
    const text = String(value);
    const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const toCsv = (header: string[], rows: Cell[][]) =>
    [header, ...rows].map(row => row.map(toCell).join(",")).join("\r\n") + "\r\n";
