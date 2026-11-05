"use client";

import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {toast} from "sonner";
import {formatInLogTime, formatUtcOffset} from "@utils/dateHelpers";
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import simulation from "@modules/simulation";
import axios from "axios";
import {ProcessAnalysis, SimulationData} from "@definitions/api/types";
import {Canvas} from "bpmn-js/lib/features/context-pad/ContextPadProvider";
import {ColorMode, SimulationHooks, TokenSimulationApi, WTPTState} from "@definitions/simulation/types";
import {isTaskType} from "@modules/simulation/restLayout";
import {DEFAULT_HOURS_PER_SECOND, SPEEDS} from "@modules/simulation/speed";
import {enableTouchNavigation} from "@modules/simulation/touchNavigation";
import {sampleIndexAt} from "@utils/processAnalysis";
import {readSharedView, SharedView, writeSharedView} from "@utils/viewLink";
import {buildDiagramSvg, downloadPng, downloadSvg} from "@utils/diagramSnapshot";
import TaskPanel from "@components/simulation/TaskPanel";
import DiagramControls from "@components/simulation/DiagramControls";
import CaseBanner from "@components/simulation/CaseBanner";
import ExportMenu from "@components/simulation/ExportMenu";
import HelpOverlay from "@components/simulation/HelpOverlay";

const HELP_SEEN_KEY = "prosim-help-seen";
const NARROW_LAYOUT = "(max-width: 1200px)";
const FOCUS_SCALE = 1;
const ZOOMED_OUT_BELOW = 0.6;
const TASK_PANEL_SPACE = 360;
const PHONE_WIDTH = 640;
const NO_ELEMENTS: string[] = [];

const isNarrowLayout = () => window.matchMedia?.(NARROW_LAYOUT).matches ?? false;

type DiagramCanvas = Canvas & {
    zoom: (scale?: number | string, center?: string) => number;
    resized?: () => void;
    viewbox?: {
        (): {outer: {width: number; height: number}};
        (box: {x: number; y: number; width: number; height: number}): unknown;
    };
    addMarker?: (elementId: string, marker: string) => void;
    removeMarker?: (elementId: string, marker: string) => void;
    getActiveLayer?: () => SVGGElement;
};

type DiagramEvents = {
    on?: (event: string, callback: (event: {viewbox: {scale: number}}) => void) => void;
};

const Simulation = () => {
    const viewerRef = useRef(null);
    const viewerInstanceRef = useRef<NavigatedViewer | null>(null);
    const xmlFetchedRef = useRef(false);
    const initializedProcessIdRef = useRef<string | null>(null);
    const [xml, setXml] = useState<string>(null);
    const [simulationData, setSimulationData] = useState<SimulationData>();
    const [workload, setWorkload] = useState<Array<number>>();
    const [cycleTimeData, setCycleTimeData] = useState<Array<number>>([]);
    const [statsVisible, setStatsVisible] = useState(true);
    const [numberOfCases, setNumberOfCases] = useState<{
        ongoing: number;
        finished: number;
    }>({
        ongoing: 0,
        finished: 0,
    });
    const [waitingProcessingTimes, setWaitingProcessingTimes] = useState<WTPTState>({});
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null);
    const [analysis, setAnalysis] = useState<ProcessAnalysis | null>(null);
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [colorMode, setColorMode] = useState<ColorMode>("state");
    const [speed, setSpeed] = useState(DEFAULT_HOURS_PER_SECOND);
    const [followedCase, setFollowedCase] = useState<number | null>(null);
    const [helpOpen, setHelpOpen] = useState(false);
    const sharedViewRef = useRef<SharedView>({});
    const syncAddressBarRef = useRef<() => void>(() => {});
    const hooksRef = useRef<SimulationHooks>({
        onTaskClick: setSelectedTaskId,
        onCaseClick: caseId => setFollowedCase(current => current === caseId ? null : caseId),
        onViewChange: () => syncAddressBarRef.current(),
        onOpenFailed: () => toast.error("Could not open that moment", {description: "Showing the start of the simulation instead."}),
    });
    const { id } = useParams();
    const processId = Array.isArray(id) ? id[0] : id;
    const chartWidth = 226;
    const chartHeight = 120;

    const getTaskIdToNameMap = (viewer: NavigatedViewer): WTPTState => {
        const elementRegistry = viewer.get("elementRegistry") as Canvas;

        const map: WTPTState = {};

        for (const el of elementRegistry.getAll()) {
            const bo = el.businessObject;
            if (!bo) continue;

            if (!isTaskType(bo.$type)) continue;

            map[el.id] = {
                _count: 0,
                averagePT: 0,
                averageWT: 0,
                incompleteCases: {},
                name: (bo.name ?? "").trim()
            };
        }

        return map;
    }

    useEffect(() => {
        if (isNarrowLayout()) setStatsVisible(false);
        try {
            if (!localStorage.getItem(HELP_SEEN_KEY)) setHelpOpen(true);
        } catch {
            setHelpOpen(true);
        }
    }, []);

    useEffect(() => {
        if (!processId) return;
        if (initializedProcessIdRef.current === processId) return;
        initializedProcessIdRef.current = processId;

        xmlFetchedRef.current = false;
        setXml(null);
        setSimulationData(undefined);
        setWorkload(undefined);
        setCycleTimeData([]);
        setAnalysis(null);
        setSelectedTaskId(null);
        setFollowedCase(null);

        const sharedView = readSharedView(window.location.search);
        sharedViewRef.current = sharedView;
        setSpeed(sharedView.hoursPerSecond ?? DEFAULT_HOURS_PER_SECOND);
        setColorMode(sharedView.colorMode ?? "state");

        if (viewerInstanceRef.current) {
            viewerInstanceRef.current.destroy();
            viewerInstanceRef.current = null;
        }

        const fetchSimulationData = async () => {
            try {
                const res = await axios.get(`/api/simulation/${processId}`);
                return res.data;
            } catch (error) {
                const status = error?.response?.status;
                setLoadError(status === 404 || status === 410 ? "missing" : "failed");
            }
        }

        const fetchWorkloadData = async () => {
            try {
                const res = await axios.get(`/api/simulation/${processId}/workload`);
                return res.data;
            } catch (error) {
                console.error(error);
            }
        }

        const fetchCycleTimeData = async () => {
            try {
                const res = await axios.get(`/api/simulation/${processId}/cycle-time`);
                return res.data;
            } catch (error) {
                console.error(error);
            }
        }

        const fetchAnalysis = async () => {
            try {
                const res = await axios.get(`/api/simulation/${processId}/analysis`);
                const data = res?.data as ProcessAnalysis | undefined;
                return Array.isArray(data?.open) && data.open.length && data.tasks ? data : null;
            } catch (error) {
                console.warn("Could not load the simulation analysis", error);
                return null;
            }
        }

        fetchSimulationData()
            .then((data: SimulationData) => {
                setSimulationData(data);
                setNumberOfCases({
                    ongoing: data.frames.length,
                    finished: 0,
                });

                const buffer = Buffer.from(data.file);
                const blob = new Blob([buffer], { type: 'application/octet-stream' });

                return blob.text();
            })
            .then((text) => {
                if (text && !xmlFetchedRef.current) {
                    xmlFetchedRef.current = true;
                    setXml(text);
                }
            })
            .catch(() => {});
        fetchWorkloadData()
            .then((data: Array<number>) => {
                setWorkload(data);
            });
        fetchCycleTimeData()
            .then((data: Array<number>) => {
                setCycleTimeData(data);
            });
        fetchAnalysis().then(setAnalysis);
    }, [processId]);

    useEffect(() => {
        const hooks = hooksRef.current;
        hooks.getCaseArrival = caseId => analysis?.caseArrivals[caseId];
        hooks.getAverageCycleTime = () => analysis?.averageCycleTimeMs ?? null;
        hooks.describeMoment = moment => {
            if (analysis) return `${analysis.open[sampleIndexAt(analysis, moment)]} cases in progress`;
            if (!workload?.length || !simulationData) return null;
            const start = new Date(simulationData.startDate + "Z").getTime();
            const end = new Date(simulationData.endDate + "Z").getTime();
            const index = Math.floor((moment - start) / Math.max(end - start, 1) * workload.length);
            return `${workload[Math.max(0, Math.min(workload.length - 1, index))]} cases in progress`;
        };
    }, [analysis, workload, simulationData]);

    useEffect(() => {
        if (xml !== null && simulationData && typeof window !== "undefined") {
            if (viewerInstanceRef.current) return;

            const {moment, hoursPerSecond, colorMode: sharedColorMode, taskId, caseId} = sharedViewRef.current;
            const viewer = new NavigatedViewer({
                container: viewerRef.current,
                textRenderer: {defaultStyle: {fontSize: 13}},
                additionalModules: [simulation(simulationData, setNumberOfCases, setWaitingProcessingTimes, hooksRef.current, {
                    moment,
                    hoursPerSecond,
                    colorMode: sharedColorMode,
                })]
            });
            viewerInstanceRef.current = viewer;

            viewer.importXML(xml).then(() => {
                const canvas = viewer.get('canvas') as Canvas;
                canvas.zoom('fit-viewport');

                const activityNodeIdMap = getTaskIdToNameMap(viewer);
                setWaitingProcessingTimes(activityNodeIdMap);

                const tokenSimulation = viewer.get('tokenSimulation') as TokenSimulationApi;
                tokenSimulation.start();

                enableTouchNavigation(viewerRef.current, canvas as unknown as Parameters<typeof enableTouchNavigation>[1]);
                const showZoomLevel = (scale: number) => viewerRef.current?.classList.toggle('zoomed-out', scale < ZOOMED_OUT_BELOW);
                showZoomLevel(canvas.zoom());
                (viewer.get('eventBus') as DiagramEvents).on?.('canvas.viewbox.changed', ({viewbox}) => showZoomLevel(viewbox.scale));
                if (taskId && activityNodeIdMap[taskId]) focusTaskRef.current(taskId);
                if (caseId !== undefined) setFollowedCase(caseId);
            });
        }
    }, [xml, simulationData]);

    const statsToggledRef = useRef(false);
    useEffect(() => {
        if (!statsToggledRef.current) {
            statsToggledRef.current = true;
            return;
        }
        if (isNarrowLayout()) return;
        const timeout = setTimeout(() => {
            const viewer = viewerInstanceRef.current;
            if (!viewer) return;
            const canvas = viewer.get('canvas') as Canvas & { resized: () => void };
            canvas.resized();
            canvas.zoom('fit-viewport');
        }, 320);
        return () => clearTimeout(timeout);
    }, [statsVisible]);

    const getTokenSimulation = useCallback(
        () => viewerInstanceRef.current?.get('tokenSimulation') as TokenSimulationApi | undefined, []);

    const changeColorMode = (mode: ColorMode) => {
        setColorMode(mode);
        getTokenSimulation()?.setColorMode?.(mode);
    };

    const zoom = (factor: number | "fit") => {
        const canvas = viewerInstanceRef.current?.get('canvas') as (Canvas & { zoom: (scale?: number | string, center?: string) => number }) | undefined;
        if (!canvas) return;
        if (factor === "fit") canvas.zoom('fit-viewport');
        else canvas.zoom(canvas.zoom() * factor, 'auto');
    };

    const focusTask = (taskId: string) => {
        setSelectedTaskId(taskId);
        if (isNarrowLayout()) setStatsVisible(false);

        const viewer = viewerInstanceRef.current;
        const canvas = viewer?.get('canvas') as DiagramCanvas | undefined;
        const element = (viewer?.get('elementRegistry') as Canvas | undefined)?.get?.(taskId);
        if (!canvas?.viewbox || !element) return;

        const {outer} = canvas.viewbox();
        const scale = Math.max(canvas.zoom(), FOCUS_SCALE);
        const phone = outer.width <= PHONE_WIDTH;
        const anchorX = (phone ? outer.width : outer.width - TASK_PANEL_SPACE) / 2;
        const anchorY = phone ? outer.height / 4 : outer.height / 2;
        canvas.viewbox({
            x: element.x + element.width / 2 - anchorX / scale,
            y: element.y + element.height / 2 - anchorY / scale,
            width: outer.width / scale,
            height: outer.height / scale,
        });
    };
    const focusTaskRef = useRef(focusTask);
    focusTaskRef.current = focusTask;

    const getMarkers = useCallback(() => viewerInstanceRef.current?.get('canvas') as DiagramCanvas | undefined, []);

    useEffect(() => {
        const markers = getMarkers();
        if (!selectedTaskId || !markers?.addMarker) return;
        markers.addMarker(selectedTaskId, 'selected-task');
        document.querySelector('.wtpt-row.selected')?.scrollIntoView?.({block: 'nearest'});
        return () => markers.removeMarker(selectedTaskId, 'selected-task');
    }, [selectedTaskId, getMarkers]);

    useEffect(() => {
        getTokenSimulation()?.setFollowedCase?.(followedCase);
    }, [followedCase, getTokenSimulation]);

    useEffect(() => {
        const handleResize = () => {
            const canvas = getMarkers();
            canvas?.resized?.();
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [getMarkers]);

    const getSelectedQueue = useCallback(
        () => (selectedTaskId ? getTokenSimulation()?.getTaskQueue?.(selectedTaskId) : null) ?? [],
        [selectedTaskId, getTokenSimulation]);
    const getCurrentTime = useCallback(() => getTokenSimulation()?.getCurrentTime?.() ?? null, [getTokenSimulation]);
    const closeTaskPanel = useCallback(() => setSelectedTaskId(null), []);
    const stopFollowing = useCallback(() => setFollowedCase(null), []);
    const describeCase = useCallback((caseId: number) => getTokenSimulation()?.describeCase?.(caseId) ?? [], [getTokenSimulation]);
    const caseNotFound = useCallback(() => {
        setFollowedCase(null);
        toast.error("That case could not be found in this simulation");
    }, []);

    const closeHelp = useCallback(() => {
        setHelpOpen(false);
        try {
            localStorage.setItem(HELP_SEEN_KEY, "1");
        } catch {
            return;
        }
    }, []);

    const startElements = useMemo(() => {
        const frame = simulationData?.frames.find(({caseId}) => caseId === followedCase);
        return frame ? Object.values(frame.activeElements) : NO_ELEMENTS;
    }, [simulationData, followedCase]);

    const viewQuery = useCallback(() => {
        const moment = getCurrentTime();
        const start = simulationData ? Date.parse(simulationData.startDate + "Z") : null;
        return writeSharedView({
            moment: moment !== null && moment !== start ? moment : undefined,
            hoursPerSecond: speed,
            colorMode,
            taskId: selectedTaskId ?? undefined,
            caseId: followedCase ?? undefined,
        });
    }, [getCurrentTime, simulationData, speed, colorMode, selectedTaskId, followedCase]);

    useEffect(() => {
        const syncAddressBar = () => {
            if (getCurrentTime() === null) return;
            window.history.replaceState(window.history.state, "", window.location.pathname + viewQuery());
        };
        syncAddressBarRef.current = syncAddressBar;
        syncAddressBar();
    }, [getCurrentTime, viewQuery]);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            if (helpOpen) closeHelp();
            else if (selectedTaskId) closeTaskPanel();
            else stopFollowing();
        };
        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [helpOpen, selectedTaskId, closeHelp, closeTaskPanel, stopFollowing]);

    useEffect(() => {
        const actions: Record<string, string> = {" ": "play-pause-btn", Home: "go-to-start-btn", End: "go-to-end-btn"};

        const handleKey = (event: KeyboardEvent) => {
            const buttonId = actions[event.key];
            if (!buttonId || event.ctrlKey || event.metaKey || event.altKey) return;

            const target = event.target as HTMLElement;
            const inPlayControls = Boolean(target.closest?.('#play-controls'));
            if (!inPlayControls && target.closest?.('input, select, textarea, button, a, [contenteditable="true"]')) return;

            event.preventDefault();
            if (event.type === "keydown" && !event.repeat) document.getElementById(buttonId)?.click();
        };

        window.addEventListener("keydown", handleKey);
        window.addEventListener("keyup", handleKey);
        return () => {
            window.removeEventListener("keydown", handleKey);
            window.removeEventListener("keyup", handleKey);
        };
    }, []);

    const copyLink = async () => {
        const link = window.location.origin + window.location.pathname + viewQuery();
        try {
            await navigator.clipboard.writeText(link);
            toast.success("Link copied", {description: "It opens this simulation at this moment, with the same speed and colours."});
        } catch {
            toast.error("Could not copy the link", {description: link});
        }
    };

    const saveSnapshot = async (format: "png" | "svg") => {
        const canvas = getMarkers();
        const layer = canvas?.getActiveLayer?.();
        const svg = viewerRef.current?.querySelector("svg");
        if (!layer || !svg) return;

        const moment = getCurrentTime() ?? 0;
        const time = formatInLogTime(new Date(moment), utcOffset);
        const {markup, width, height} = buildDiagramSvg(svg, layer,
            `${time} ${formatUtcOffset(utcOffset)} · ${numberOfCases.ongoing} cases in progress`);
        const fileName = `simulation-${processId.slice(0, 8)}-${time.replace(/\D/g, "")}.${format}`;

        try {
            if (format === "svg") downloadSvg(markup, fileName);
            else await downloadPng(markup, width, height, fileName);
        } catch (error) {
            console.error(error);
            toast.error("Could not save the diagram");
        }
    };

    useEffect(() => {
        return () => {
            if (viewerInstanceRef.current) {
                viewerInstanceRef.current.destroy();
                viewerInstanceRef.current = null;
            }
        };
    }, []);

    const workloadBars = useMemo(() => {
        if (!workload) return null;

        const max = Math.max(...workload, 1);

        return workload.map((count, index) => {
            const heightPercent = count / max * 100;

            return (
                <div
                    key={index}
                    className="timeline-shade"
                    style={{ height: `${heightPercent}%` }}
                ></div>
            );
        });
    }, [workload]);

    const ctPolylinePoints = useMemo(() => {
        if (!cycleTimeData || cycleTimeData.length === 0) return "";

        const max = Math.max(...cycleTimeData);
        const n = cycleTimeData.length;

        return cycleTimeData
            .map((v, i) => {
                const x = (i / (n - 1)) * chartWidth;

                const heightPercent = v / max;
                const y = chartHeight - heightPercent * chartHeight;

                return `${x.toFixed(2)},${y.toFixed(2)}`;
            })
            .join(" ");
    }, [cycleTimeData]);

    const ctMaxHours = cycleTimeData && cycleTimeData.length > 0 ? Math.max(...cycleTimeData) / 3600000 : null;
    const formatChartDate = (date: string) =>
        new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", timeZone: "UTC"}).format(
            new Date(formatInLogTime(new Date(date + "Z"), simulationData?.utcOffset ?? "+00:00").replace(" ", "T") + "Z"));

    const workloadMax = workload?.length ? Math.max(...workload) : null;
    const utcOffset = simulationData?.utcOffset ?? "+00:00";

    const wtptList = useMemo(() => {
        return Object.entries(waitingProcessingTimes)
            .map(([nodeId, stats]) => ({ nodeId, stats }))
            .sort((a, b) => {
                const comparison = a.stats.name.localeCompare(b.stats.name);
                return sortOrder === "asc" ? comparison : -comparison;
            });
    }, [waitingProcessingTimes, sortOrder]);

    if (loadError) {
        return <div className="mx-auto mt-16 max-w-xl rounded-2xl border-2 border-slate-300 bg-slate-100 p-8 text-center">
            <h2 className="mb-2 text-xl font-semibold">
                {loadError === "missing" ? "Simulation not found or expired" : "The simulation could not be loaded"}
            </h2>
            <p className="mb-6 text-sm text-slate-600">
                {loadError === "missing"
                    ? "This link does not point to an existing simulation. Simulations are deleted after 30 days without being opened."
                    : "Something went wrong while loading this simulation. Please reload the page in a moment."}
            </p>
            <Link href="/" className="rounded-2xl border-2 border-emerald-800 bg-emerald-600 px-6 py-2 font-bold text-green-50">
                Start a new simulation
            </Link>
        </div>;
    }

    return <>
        <div className="simulation-toolbar">
            <Link href="/" className="toolbar-btn">← New simulation</Link>
            <button type="button" className="toolbar-btn" onClick={copyLink}>Copy link</button>
            <ExportMenu processId={processId} onSnapshot={saveSnapshot}/>
            <span className="toolbar-hint">Space: play/pause · Home/End: jump</span>
        </div>
        <DiagramControls
            className={statsVisible ? 'diagram-toolbar with-stats' : 'diagram-toolbar'}
            colorMode={colorMode}
            onColorModeChange={changeColorMode}
            hasCycleTime={analysis === null || analysis.averageCycleTimeMs !== null}
            onHelp={() => setHelpOpen(true)}
            onZoomIn={() => zoom(1.25)}
            onZoomOut={() => zoom(0.8)}
            onFit={() => zoom("fit")}
        />
        <div className={statsVisible ? 'diagram-area with-stats' : 'diagram-area'}>
            <div ref={viewerRef} className={'bpmn-viewer'}></div>
            {selectedTaskId && <TaskPanel
                key={selectedTaskId}
                taskId={selectedTaskId}
                name={waitingProcessingTimes[selectedTaskId]?.name || selectedTaskId}
                stats={waitingProcessingTimes[selectedTaskId]}
                analysis={analysis}
                utcOffset={utcOffset}
                getQueue={getSelectedQueue}
                getCurrentTime={getCurrentTime}
                followedCase={followedCase}
                onFollowCase={setFollowedCase}
                onClose={closeTaskPanel}
            />}
            {followedCase !== null && <CaseBanner
                processId={processId}
                caseId={followedCase}
                startElements={startElements}
                utcOffset={utcOffset}
                getMarkers={getMarkers}
                getCurrentTime={getCurrentTime}
                describeCase={describeCase}
                onMissing={caseNotFound}
                onClose={stopFollowing}
            />}
            {helpOpen && <HelpOverlay onClose={closeHelp}/>}
        </div>
        <div id={'token-tooltip'} className={'token-tooltip'} role="tooltip"></div>
        <div id={'timeline'} className={'timeline'}>
            <div className="timeline-shade-wrapper">
                {workloadBars}
            </div>
            {workloadMax !== null && <span className="workload-label">Cases in progress <span className="stats-unit">(highest {workloadMax})</span></span>}
            <div id={'progress-bar'} className={'progress-bar'}></div>
            <div id={'pointer'} className={'pointer'}></div>
            <small id={'start-date'} className={'start-date'}></small>
            <small id={'end-date'} className={'end-date'}></small>
        </div>
        <div id={'timeline-tooltip'} className={'timeline-tooltip'}></div>
        <div id={'play-controls'} className={'play-controls'}>
            <button id={'go-to-start-btn'} className={'control-btn'} title="Go to start (Home)">⏮</button>
            <button id={'play-pause-btn'} className={'control-btn'} title="Play/pause (Space)">⏸</button>
            <button id={'go-to-end-btn'} className={'control-btn'} title="Go to end (End)">⏭</button>
        </div>
        <div id={'simulated-time-box'} className={'simulated-time-box'}>--</div>
        <label className="speed-control">
            <span className="speed-label">Speed</span>
            <select id={'speed-select'} className={'speed-select'} value={speed}
                    onChange={event => setSpeed(Number(event.target.value))}
                    title="Simulated time per second. From 6 hours/s the dots jump instead of travelling.">
                {SPEEDS.map(({hoursPerSecond, label}) => (
                    <option value={hoursPerSecond} key={hoursPerSecond}>{label}</option>
                ))}
            </select>
        </label>

        <div className={'stats-sidebar'}
             style={{ transform: statsVisible ? 'translateX(0)' : 'translateX(300px)' }}
        >
            <button
                className={'stats-toggle-btn'}
                onClick={() => setStatsVisible(!statsVisible)}
            >
                {statsVisible ? '▶' : '◀'}
            </button>
            <div className={'stats-container'}>
                <h2>Statistics</h2>
                <div className={'stats-element'}>
                    <h3># Cases</h3>
                    <p><i>Ongoing:</i> {numberOfCases.ongoing}</p>
                    <p><i>Finished:</i> {numberOfCases.finished}</p>
                </div>
                <div className={'stats-element'}>
                    <h3>Average cycle time <span className="stats-unit">(hours)</span></h3>
                    <div className="stats-element-chart">
                        <div className="y-axis"></div>
                        {ctMaxHours !== null && <>
                            <div className="y-tick y-tick-max">{ctMaxHours >= 10 ? Math.round(ctMaxHours) : ctMaxHours.toFixed(1)}</div>
                            <div className="y-tick y-tick-zero">0</div>
                        </>}

                        <div className="x-axis"></div>
                        {simulationData && <>
                            <div className="x-tick x-tick-start">{formatChartDate(simulationData.startDate)}</div>
                            <div className="x-tick x-tick-end">{formatChartDate(simulationData.endDate)}</div>
                        </>}

                        <svg className="line-svg" viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
                            <polyline
                                points={ctPolylinePoints}
                                fill="none"
                                stroke="blue"
                                strokeWidth="2"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        </svg>

                        <div id="cycle-time-chart-time-bar" style={{ width: "calc(100% - 24px)" }}></div>
                    </div>
                </div>
                <div className={'stats-element'}>
                    <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        Average WT/PT
                        <button
                            className="sort-btn"
                            onClick={() => setSortOrder(prev => prev === "asc" ? "desc" : "asc")}
                        >
                            {sortOrder === "asc" ? "A→Z" : "Z→A"}
                        </button>
                    </h3>
                    <div className="wtpt-list">
                    {wtptList.map(({ nodeId, stats }) => {
                        const hasData =
                            stats.averageWT >= 0 &&
                            stats.averagePT >= 0 &&
                            stats.averageWT + stats.averagePT > 0;

                        const total = stats.averageWT + stats.averagePT;
                        const wtPct = hasData ? (stats.averageWT / total) * 100 : 0;
                        const ptPct = hasData ? (stats.averagePT / total) * 100 : 0;

                        const wtHours = hasData ? (stats.averageWT / 3600000).toFixed(2) : null;
                        const ptHours = hasData ? (stats.averagePT / 3600000).toFixed(2) : null;

                        return (
                            <button
                                type="button"
                                key={nodeId}
                                className={nodeId === selectedTaskId ? "wtpt-row selected" : "wtpt-row"}
                                aria-pressed={nodeId === selectedTaskId}
                                title="Show on the diagram"
                                onClick={() => focusTask(nodeId)}
                            >
                                <div className="wtpt-row-top">
                                    <span className="wtpt-name">{stats.name}</span>
                                </div>

                                <div className="wtpt-bar-track">
                                    {!hasData ? (
                                        <div className="wtpt-bar wtpt-bar-empty">
                                            <span className="wtpt-bar-empty-label">No data yet</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div
                                                className="wtpt-bar wtpt-bar-wt"
                                                style={{ width: `${wtPct}%` }}
                                            >
                                                {wtPct >= 12 &&
                                                    <span className="wtpt-bar-label">
                                                        {wtHours}h
                                                    </span>
                                                }
                                            </div>

                                            <div
                                                className="wtpt-bar wtpt-bar-pt"
                                                style={{ width: `${ptPct}%` }}
                                            >
                                                {ptPct >= 12 &&
                                                    <span className="wtpt-bar-label">
                                                        {ptHours}h
                                                    </span>
                                                }
                                            </div>
                                        </>
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
                </div>
            </div>
        </div>
    </>;
}

export default Simulation;
