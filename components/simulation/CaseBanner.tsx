import {useEffect, useRef, useState} from "react";
import axios from "axios";
import {CaseEvent, caseBounds, visitedElements} from "@utils/casePath";
import {formatDuration, formatShortDate} from "@utils/dateHelpers";

type Markers = {
    addMarker?: (elementId: string, marker: string) => void;
    removeMarker?: (elementId: string, marker: string) => void;
};

type Props = {
    processId: string;
    caseId: number;
    startElements: string[];
    utcOffset: string;
    getMarkers: () => Markers | undefined;
    getCurrentTime: () => number | null;
    describeCase: (caseId: number) => string[];
    onMissing: () => void;
    onClose: () => void;
};

const CaseBanner = ({processId, caseId, startElements, utcOffset, getMarkers, getCurrentTime, describeCase, onMissing, onClose}: Props) => {
    const [events, setEvents] = useState<CaseEvent[] | null>(null);
    const [status, setStatus] = useState("");
    const marked = useRef(new Set<string>());

    useEffect(() => {
        let current = true;
        setEvents(null);
        axios.get(`/api/simulation/${processId}/case/${caseId}`)
            .then(res => {
                if (!current) return;
                if (!res.data.length && !startElements.length) onMissing();
                else setEvents(res.data);
            })
            .catch(error => {
                console.warn("Could not load the case", error);
                if (current) onMissing();
            });
        return () => { current = false; };
    }, [processId, caseId, startElements, onMissing]);

    useEffect(() => {
        if (!events) return;
        const {arrival, end} = caseBounds(events);
        const applied = marked.current;

        const update = () => {
            const moment = getCurrentTime();
            if (moment === null) return;
            const markers = getMarkers();

            const visited = arrival !== null && moment < arrival ? new Set<string>() : visitedElements(events, startElements, moment);
            applied.forEach(elementId => {
                if (visited.has(elementId)) return;
                markers?.removeMarker?.(elementId, "case-path");
                applied.delete(elementId);
            });
            visited.forEach(elementId => {
                if (applied.has(elementId)) return;
                markers?.addMarker?.(elementId, "case-path");
                applied.add(elementId);
            });

            if (arrival !== null && moment < arrival) setStatus(`Starts ${formatShortDate(new Date(arrival), utcOffset, true)}`);
            else if (end !== null && moment >= end) {
                const took = arrival !== null ? `, open ${formatDuration(end - arrival)}` : "";
                setStatus(`Finished ${formatShortDate(new Date(end), utcOffset, true)}${took}`);
            } else setStatus(describeCase(caseId).join(" · "));
        };

        update();
        const interval = setInterval(update, 300);
        return () => {
            clearInterval(interval);
            const markers = getMarkers();
            applied.forEach(elementId => markers?.removeMarker?.(elementId, "case-path"));
            applied.clear();
        };
    }, [events, caseId, startElements, utcOffset, getMarkers, getCurrentTime, describeCase]);

    return <div className="case-banner">
        <span className="case-banner-text"><b>Case {caseId}</b>{status && <> · {status}</>}</span>
        <button type="button" className="task-panel-close" onClick={onClose} aria-label="Stop following this case">×</button>
    </div>;
};

export default CaseBanner;
