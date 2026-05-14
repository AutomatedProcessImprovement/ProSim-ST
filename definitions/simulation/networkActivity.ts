export type NetworkActivitySample = {
    t: number; // Date.now() at response receipt
    bytes: number;
};

export type NetworkActivityState = {
    totalBytes: number;
    requestCount: number;
    samples: NetworkActivitySample[];
};

export const INITIAL_NETWORK_ACTIVITY_STATE: NetworkActivityState = {
    totalBytes: 0,
    requestCount: 0,
    samples: [],
};

export function measureResponseBytes(res: { headers?: Record<string, unknown>; data: unknown }): number {
    const cl = res.headers?.["content-length"];
    if (cl !== undefined && cl !== null) {
        const n = typeof cl === "number" ? cl : parseInt(String(cl), 10);
        if (!Number.isNaN(n) && n > 0) return n;
    }
    try {
        return new Blob([JSON.stringify(res.data)]).size;
    } catch {
        return 0;
    }
}

export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
