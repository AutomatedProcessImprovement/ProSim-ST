import {MouseEvent} from "react";
import {formatShortDate} from "@utils/dateHelpers";
import {OpenCasesSeries} from "@utils/ongoingCases";

type Props = {
    series: OpenCasesSeries;
    selected: number | null;
    utcOffset: string;
    onPick: (moment: number) => void;
};

const CHART_WIDTH = 600;
const CHART_HEIGHT = 70;

const OpenCasesChart = ({series, selected, utcOffset, onPick}: Props) => {
    const {from, to, counts, peak, peakMoment} = series;
    const points = counts
        .map((count, index) => `${(index / (counts.length - 1) * CHART_WIDTH).toFixed(1)},${(CHART_HEIGHT - count / Math.max(peak, 1) * CHART_HEIGHT).toFixed(1)}`)
        .join(" ");
    const markerX = selected !== null ? Math.max(0, Math.min(1, (selected - from) / (to - from))) * CHART_WIDTH : null;

    const pick = (event: MouseEvent<SVGSVGElement>) => {
        const {left, width} = event.currentTarget.getBoundingClientRect();
        onPick(from + Math.max(0, Math.min(1, (event.clientX - left) / width)) * (to - from));
    };

    return <div className='open-cases-chart'>
        <div className='flex items-baseline justify-between gap-4 text-sm'>
            <span>Cases in progress in the log <span className='stats-unit'>(highest {peak})</span></span>
            <button type='button' className='toolbar-btn' onClick={() => onPick(peakMoment)}>Use the busiest moment</button>
        </div>
        <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} preserveAspectRatio='none' role='img' onClick={pick}
             aria-label={`Cases in progress over the uploaded log, at most ${peak}. Click to set the starting point.`}>
            <polygon points={`0,${CHART_HEIGHT} ${points} ${CHART_WIDTH},${CHART_HEIGHT}`} className='open-cases-area'/>
            {markerX !== null && <line x1={markerX} x2={markerX} y1={0} y2={CHART_HEIGHT} className='now-line'/>}
        </svg>
        <div className='flex justify-between text-xs text-slate-500'>
            <span>{formatShortDate(new Date(from), utcOffset)}</span>
            <span>{formatShortDate(new Date(to), utcOffset)}</span>
        </div>
    </div>;
};

export default OpenCasesChart;
