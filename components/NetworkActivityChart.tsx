import { NetworkActivityState, formatBytes } from "@definitions/simulation/networkActivity";

export function NetworkActivityChart({ state }: { state: NetworkActivityState }) {
    const { totalBytes, requestCount, samples } = state;
    const hasData = samples.length > 0;

    function handleDownloadCsv() {
        if (!hasData) return;
        const t0 = samples[0].t;
        const header = "request_index,elapsed_ms,bytes\n";
        const rows = samples
            .map((s, i) => `${i + 1},${s.t - t0},${s.bytes}`)
            .join("\n");
        const csv = header + rows + "\n";
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `network-activity-${Date.now()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="stats-element">
            <h3>Network Activity</h3>
            <div style={{ fontSize: 11, color: "#333", marginBottom: 8 }}>
                Total: <strong>{hasData ? formatBytes(totalBytes) : "--"}</strong> &middot;{" "}
                <strong>{requestCount}</strong> requests
            </div>
            <button
                onClick={handleDownloadCsv}
                disabled={!hasData}
                style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    cursor: hasData ? "pointer" : "not-allowed",
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    background: "#f5f5f5",
                    opacity: hasData ? 1 : 0.5,
                }}
            >
                Download CSV
            </button>
        </div>
    );
}
