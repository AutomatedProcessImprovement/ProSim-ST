import { useRef } from "react";
import { QueueMetricsState } from "@definitions/simulation/networkMetrics";

function LegendItem({ color, dashed, children }: { color: string; dashed?: boolean; children: React.ReactNode }) {
    return (
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="18" height="8" style={{ flexShrink: 0 }}>
                <line x1="0" y1="4" x2="18" y2="4"
                    stroke={color} strokeWidth="1.5"
                    strokeDasharray={dashed ? "3 2" : undefined} />
            </svg>
            <span style={{ color }}>{children}</span>
        </span>
    );
}

const W = 226, H = 120;
const MAX_QUEUE = 15;
const POLL_THRESHOLD = 5;
const WINDOW = 50;

export function BatchQueueChart({ metrics }: { metrics: QueueMetricsState }) {
    const svgRef = useRef<SVGSVGElement>(null);
    const { samples, totalBatches } = metrics;

    if (samples.length === 0 || totalBatches === 0) return null;

    const toX = (i: number) => (i / (WINDOW - 1)) * W;
    const toY = (q: number) => H - (q / MAX_QUEUE) * H;

    const queuePoints = samples
        .map((s, i) => `${toX(i).toFixed(1)},${toY(s.queueLength).toFixed(1)}`)
        .join(" ");

    const refYPoll = toY(POLL_THRESHOLD);
    const refYMax  = toY(MAX_QUEUE);

    function handleExport() {
        if (!svgRef.current) return;

        const ANNOT_H = 55;
        const totalH = H + ANNOT_H;
        const inner = svgRef.current.innerHTML;

        const svgW = W + 24;
        const fullSvg = [
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${totalH}" width="${svgW}" height="${totalH}">`,
            `  <rect width="${svgW}" height="${totalH}" fill="white"/>`,
            `  <g>${inner}</g>`,
            `  <line x1="0" y1="${H + 6}" x2="${W}" y2="${H + 6}" stroke="#ddd" stroke-width="1"/>`,
            `  <text x="2" y="${H + 18}" font-size="9" font-family="sans-serif" fill="#333">Naive: ${totalBatches} batches front-loaded at t=0</text>`,
            `  <text x="2" y="${H + 30}" font-size="9" font-family="sans-serif" fill="#76c7c0">Distributed: max ${MAX_QUEUE} buffered at a time</text>`,
            `  <line x1="2" y1="${H + 39}" x2="18" y2="${H + 39}" stroke="#888" stroke-width="1.5" stroke-dasharray="3 2"/>`,
            `  <text x="22" y="${H + 43}" font-size="9" font-family="sans-serif" fill="#888">Buffer cap (${MAX_QUEUE})</text>`,
            `  <line x1="${Math.round(W / 2)}" y1="${H + 39}" x2="${Math.round(W / 2) + 16}" y2="${H + 39}" stroke="#e08030" stroke-width="1.5" stroke-dasharray="3 2"/>`,
            `  <text x="${Math.round(W / 2) + 20}" y="${H + 43}" font-size="9" font-family="sans-serif" fill="#e08030">Fetch threshold (${POLL_THRESHOLD})</text>`,
            `</svg>`,
        ].join("\n");

        const SCALE = 3; // ~288 DPI
        const svgH = H + ANNOT_H;

        const blob = new Blob([fullSvg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = svgW * SCALE;
            canvas.height = svgH * SCALE;
            const ctx = canvas.getContext("2d")!;
            ctx.scale(SCALE, SCALE);
            ctx.drawImage(img, 0, 0, svgW, svgH);
            URL.revokeObjectURL(url);
            const a = document.createElement("a");
            a.href = canvas.toDataURL("image/png");
            a.download = "batch-queue.png";
            a.click();
        };
        img.src = url;
    }

    return (
        <div className="stats-element">
            <h3>Batch Queue</h3>
            <div className="stats-element-chart">
                <svg
                    ref={svgRef}
                    style={{ position: "absolute", left: 0, top: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none" }}
                    viewBox={`0 0 ${W + 24} ${H}`}
                    preserveAspectRatio="none"
                >
                    {/* axes */}
                    <line x1="24" y1="0" x2="24" y2={H} stroke="black" strokeWidth="2" />
                    <line x1="24" y1={H} x2={W + 24} y2={H} stroke="black" strokeWidth="2" />

                    {/* y-axis label */}
                    <text
                        x="10" y={H / 2}
                        fontSize="9" fill="#333" fontFamily="sans-serif"
                        textAnchor="middle"
                        transform={`rotate(-90, 10, ${H / 2})`}
                    >Batches</text>

                    {/* x-axis label */}
                    <text x={W + 24} y={H - 2} fontSize="9" fill="#333" fontFamily="sans-serif" textAnchor="end">Recent</text>

                    {/* chart content — offset right by 24 to sit inside axes */}
                    <g transform="translate(24, 0)">
                        <line x1="0" y1={refYPoll} x2={W} y2={refYPoll}
                            stroke="#e08030" strokeWidth="1" strokeDasharray="2 3" />
                        <line x1="0" y1={refYMax} x2={W} y2={refYMax}
                            stroke="#888" strokeWidth="1" strokeDasharray="2 3" />
                        <polyline points={queuePoints} fill="none"
                            stroke="#76c7c0" strokeWidth="2" strokeLinejoin="round" />
                        <text x="3" y={refYMax + 10} fontSize="9" fill="#666" fontFamily="sans-serif">{MAX_QUEUE}</text>
                        <text x="3" y={refYPoll - 3} fontSize="9" fill="#e08030" fontFamily="sans-serif">{POLL_THRESHOLD}</text>
                        <text x="3" y={H - 2} fontSize="9" fill="#666" fontFamily="sans-serif">0</text>
                    </g>
                </svg>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6, fontSize: 11 }}>
                <LegendItem color="#888" dashed>Buffer cap ({MAX_QUEUE})</LegendItem>
                <LegendItem color="#e08030" dashed>Fetch threshold ({POLL_THRESHOLD})</LegendItem>
                <LegendItem color="#76c7c0">Queue size (last {WINDOW} batches)</LegendItem>
            </div>
            <div style={{
                marginTop: 10,
                padding: "6px 8px",
                background: "#e8e8e8",
                borderRadius: 4,
                fontSize: 11,
                lineHeight: 1.6,
            }}>
                <span style={{ color: "#333" }}>Naive: <strong>{totalBatches}</strong> batches front-loaded at t=0</span>
                <br />
                <span style={{ color: "#76c7c0" }}>Distributed: max <strong>{MAX_QUEUE}</strong> buffered at a time</span>
            </div>
            <button onClick={handleExport} style={{ marginTop: 6, fontSize: 11, cursor: "pointer" }}>
                Save as PNG
            </button>
        </div>
    );
}
