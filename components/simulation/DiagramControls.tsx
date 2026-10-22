import {ColorMode} from "@definitions/simulation/types";
import {AGE_COLORS, STATE_COLORS} from "@modules/simulation/restLayout";

type Props = {
    className?: string;
    colorMode: ColorMode;
    onColorModeChange: (mode: ColorMode) => void;
    hasCycleTime: boolean;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onFit: () => void;
};

const Swatch = ({color}: {color: string}) => <i className="legend-dot" style={{background: color}}/>;

// The key to what the dots mean, the switch between the two colourings, and zoom
const DiagramControls = ({className = "diagram-toolbar", colorMode, onColorModeChange, hasCycleTime, onZoomIn, onZoomOut, onFit}: Props) => (
    <div className={className}>
        <div className="color-mode" role="group" aria-label="Colour dots by">
            <button type="button" aria-pressed={colorMode === "state"} onClick={() => onColorModeChange("state")}>State</button>
            <button type="button" aria-pressed={colorMode === "age"} onClick={() => onColorModeChange("age")}>Case age</button>
        </div>
        <div className="diagram-legend">
            {colorMode === "state" ? <ul className="diagram-legend">
                <li><Swatch color={STATE_COLORS.waiting}/> Waiting</li>
                <li><Swatch color={STATE_COLORS.working}/> In work</li>
                <li><Swatch color={STATE_COLORS.moving}/> Moving</li>
                <li><Swatch color={STATE_COLORS.sync}/> Waiting for parallel branches</li>
                <li><i className="legend-shade"/> Shading: longer queue</li>
            </ul> : <ul className="diagram-legend">
                <li><Swatch color={AGE_COLORS.young}/> Open less than the average cycle time</li>
                <li><Swatch color={AGE_COLORS.late}/> 1–2× the average</li>
                <li><Swatch color={AGE_COLORS.overdue}/> Over 2× the average</li>
                {!hasCycleTime && <li className="legend-note">No case finished yet, so ages can&apos;t be compared</li>}
            </ul>}
            <div className="legend-note">Click a task for its queue · hover a dot for the case</div>
        </div>
        <div className="zoom-controls" role="group" aria-label="Zoom">
            <button type="button" onClick={onZoomIn} aria-label="Zoom in" title="Zoom in">+</button>
            <button type="button" onClick={onZoomOut} aria-label="Zoom out" title="Zoom out">−</button>
            <button type="button" onClick={onFit} aria-label="Fit diagram" title="Fit the diagram to the screen">Fit</button>
        </div>
    </div>
);

export default DiagramControls;
