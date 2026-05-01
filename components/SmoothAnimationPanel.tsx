import { SmoothAnimationState } from "@definitions/simulation/smoothAnimation";

const SVG_W = 250;
const SVG_H = 60;
const HISTORY_CAP = 30;
const FPS_CEIL = 60;
const REF_30_Y = SVG_H - (30 / FPS_CEIL) * SVG_H;

type Props = {
    state: SmoothAnimationState;
    onReset: () => void;
};

function fpsColor(fps: number): string {
    if (fps >= 55) return "#2ecc71";
    if (fps >= 30) return "#e08030";
    return "#e74c3c";
}

export function SmoothAnimationPanel({ state, onReset }: Props) {
    const { currentFps, minFps, maxFps, averageFps, fpsHistory } = state;
    const hasData = fpsHistory.length > 0;

    const sparkPoints = fpsHistory
        .map((fps, i) => {
            const x = ((i / (HISTORY_CAP - 1)) * SVG_W).toFixed(1);
            const y = (SVG_H - Math.min(fps / FPS_CEIL, 1) * SVG_H).toFixed(1);
            return `${x},${y}`;
        })
        .join(" ");

    return (
        <div className="stats-element">
            <h3>Smooth Animation</h3>

            <div style={{ textAlign: "center", marginBottom: 8 }}>
                <span style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: hasData ? fpsColor(currentFps) : "#aaa",
                    lineHeight: 1,
                }}>
                    {hasData ? currentFps : "--"}
                </span>
                <span style={{ fontSize: 12, color: "#888", marginLeft: 4 }}>fps</span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-around", fontSize: 12, marginBottom: 10 }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#888" }}>Min</div>
                    <strong>{hasData && minFps !== Infinity ? minFps : "--"}</strong>
                </div>
                <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#888" }}>Avg</div>
                    <strong>{hasData ? averageFps : "--"}</strong>
                </div>
                <div style={{ textAlign: "center" }}>
                    <div style={{ color: "#888" }}>Max</div>
                    <strong>{hasData ? maxFps : "--"}</strong>
                </div>
            </div>

            <svg
                width={SVG_W}
                height={SVG_H}
                style={{ display: "block", border: "1px solid #e0e0e0", borderRadius: 4, marginBottom: 8 }}
            >
                {/* 60 fps reference line */}
                <line x1="0" y1="0" x2={SVG_W} y2="0"
                    stroke="#bbb" strokeWidth="1" strokeDasharray="3 2" />
                <text x="3" y="9" fontSize="8" fill="#999" fontFamily="sans-serif">60</text>

                {/* 30 fps reference line */}
                <line x1="0" y1={REF_30_Y} x2={SVG_W} y2={REF_30_Y}
                    stroke="#bbb" strokeWidth="1" strokeDasharray="3 2" />
                <text x="3" y={REF_30_Y - 2} fontSize="8" fill="#999" fontFamily="sans-serif">30</text>

                {hasData && fpsHistory.length > 1 && (
                    <polyline
                        points={sparkPoints}
                        fill="none"
                        stroke="#3498db"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />
                )}
            </svg>

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
