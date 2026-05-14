import { SCALE_OPTIONS, ScaleFactor, StressTestState } from "@definitions/simulation/stressTest";

const SVG_W = 250;
const SVG_H = 60;
const HISTORY_CAP = 30;

type Props = {
    state: StressTestState;
    scale: ScaleFactor;
    onScaleChange: (s: ScaleFactor) => void;
    onReset: () => void;
    onDownloadCsv: () => void;
};

export function StressTestPanel({ state, scale, onScaleChange, onReset, onDownloadCsv }: Props) {
    const { currentConcurrent, peakConcurrent, totalFinished, concurrencyHistory } = state;
    const hasData = concurrencyHistory.length > 0;
    const yMax = Math.max(peakConcurrent, 1);

    const sparkPoints = concurrencyHistory
        .map((v, i) => {
            const x = ((i / (HISTORY_CAP - 1)) * SVG_W).toFixed(1);
            const y = (SVG_H - (v / yMax) * SVG_H).toFixed(1);
            return `${x},${y}`;
        })
        .join(" ");

    return (
        <div className="stats-element">
            <h3>Stress Test</h3>

            {/* Scale selector */}
            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                {SCALE_OPTIONS.map(opt => (
                    <button
                        key={opt}
                        onClick={() => onScaleChange(opt)}
                        style={{
                            flex: 1,
                            fontSize: 11,
                            padding: "3px 0",
                            borderRadius: 4,
                            border: "1px solid #ccc",
                            cursor: "pointer",
                            background: scale === opt ? "#333" : "#f5f5f5",
                            color: scale === opt ? "#fff" : "#333",
                            fontWeight: scale === opt ? 700 : 400,
                        }}
                    >
                        {opt}×
                    </button>
                ))}
            </div>

            {/* Current / Peak */}
            <div style={{ display: "flex", justifyContent: "space-around", fontSize: 12, marginBottom: 8 }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#888" }}>Current</div>
                    <strong>{currentConcurrent.toLocaleString()}</strong>
                </div>
                <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#888" }}>Peak</div>
                    <strong>{peakConcurrent.toLocaleString()}</strong>
                </div>
                <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#888" }}>Finished</div>
                    <strong>{totalFinished.toLocaleString()}</strong>
                </div>
            </div>

            {/* Sparkline */}
            <svg
                width={SVG_W}
                height={SVG_H}
                style={{ display: "block", border: "1px solid #e0e0e0", borderRadius: 4, marginBottom: 8 }}
            >
                {hasData && concurrencyHistory.length > 1 && (
                    <polyline
                        points={sparkPoints}
                        fill="none"
                        stroke="#e08030"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                )}
            </svg>

            <button
                onClick={onDownloadCsv}
                style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    cursor: "pointer",
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    background: "#f5f5f5",
                    marginRight: 6,
                }}
            >
                Download CSV
            </button>
            <button
                onClick={onReset}
                style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    cursor: "pointer",
                    borderRadius: 4,
                    border: "1px solid #ccc",
                    background: "#f5f5f5",
                }}
            >
                Reset
            </button>
        </div>
    );
}