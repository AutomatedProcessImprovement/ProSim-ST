import {
    FaultToleranceState,
    FaultRate,
    FAULT_RATE_OPTIONS,
} from "@definitions/simulation/faultTolerance";

type Props = {
    state: FaultToleranceState;
    onRateChange: (rate: FaultRate) => void;
    onReset: () => void;
};

export function FaultTolerancePanel({ state, onRateChange, onReset }: Props) {
    return (
        <div className="stats-element">
            <h3>Fault Tolerance</h3>

            <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                {FAULT_RATE_OPTIONS.map(rate => (
                    <button
                        key={rate}
                        onClick={() => onRateChange(rate)}
                        style={{
                            flex: 1,
                            padding: "4px 0",
                            fontSize: 11,
                            fontWeight: state.faultRate === rate ? 700 : 400,
                            background: state.faultRate === rate ? "#76c7c0" : "#e0e0e0",
                            color: state.faultRate === rate ? "white" : "#333",
                            border: "none",
                            borderRadius: 4,
                            cursor: "pointer",
                        }}
                    >
                        {rate === 0 ? "0%" : `${rate * 100}%`}
                    </button>
                ))}
            </div>

            <p style={{ fontSize: 13, marginBottom: 4 }}>
                Batches dropped: <strong>{state.batchesDropped}</strong>
            </p>
            <p style={{ fontSize: 13, marginBottom: 10 }}>
                Gap recoveries: <strong>{state.gapRecoveries}</strong>
            </p>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span
                    style={{
                        display: "inline-block",
                        padding: "2px 10px",
                        borderRadius: 10,
                        fontSize: 11,
                        fontWeight: 600,
                        background: state.simulationCrashed ? "#e74c3c" : "#2ecc71",
                        color: "white",
                    }}
                >
                    {state.simulationCrashed ? "Crashed" : "Running"}
                </span>
            </div>

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