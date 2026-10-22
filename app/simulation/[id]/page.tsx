"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {toast} from "sonner";
import {formatInLogTime} from "@utils/dateHelpers";
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import simulation from "@modules/simulation";
import axios from "axios";
import {SimulationData} from "@definitions/api/types";
import {Canvas} from "bpmn-js/lib/features/context-pad/ContextPadProvider";
import {NodeTypes} from "@definitions/simulation/enums";
import {WTPTState} from "@definitions/simulation/types";
import { QueueMetricsState } from "@definitions/simulation/networkMetrics";
import { BatchQueueChart } from "@components/BatchQueueChart";
import { NetworkActivityChart } from "@components/NetworkActivityChart";
import { NetworkActivityState, INITIAL_NETWORK_ACTIVITY_STATE, measureResponseBytes } from "@definitions/simulation/networkActivity";
import { SmoothAnimationPanel } from "@components/SmoothAnimationPanel";
import { SmoothAnimationState, INITIAL_SMOOTH_ANIMATION_STATE } from "@definitions/simulation/smoothAnimation";

const speeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0];

const Simulation = () => {
    const viewerRef = useRef(null);
    const viewerInstanceRef = useRef<NavigatedViewer | null>(null);
    const xmlFetchedRef = useRef(false);
    const initializedProcessIdRef = useRef<string | null>(null);
    const [xml, setXml] = useState<string>(null);
    const [simulationData, setSimulationData] = useState<SimulationData>();
    const [workload, setWorkload] = useState<Array<number>>();
    const [cycleTimeData, setCycleTimeData] = useState<Array<number>>([]);
    const [statsVisible, setStatsVisible] = useState(false);
    const [numberOfCases, setNumberOfCases] = useState<{
        ongoing: number;
        finished: number;
    }>({
        ongoing: 0,
        finished: 0,
    });
    const [waitingProcessingTimes, setWaitingProcessingTimes] = useState<WTPTState>({});
    const [networkMetrics, setNetworkMetrics] = useState<QueueMetricsState | null>(null);
    const [networkActivity, setNetworkActivity] = useState<NetworkActivityState>(INITIAL_NETWORK_ACTIVITY_STATE);
    const [smoothAnimation, setSmoothAnimation] = useState<SmoothAnimationState>(INITIAL_SMOOTH_ANIMATION_STATE);
    const rafIdRef = useRef<number>(0);
    const frameCountRef = useRef<number>(0);
    const lastSecondRef = useRef<number>(0);
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const [loadError, setLoadError] = useState<"missing" | "failed" | null>(null);
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

            if (bo.$type !== NodeTypes.TASK) continue;

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
        if (!processId) return;
        if (initializedProcessIdRef.current === processId) return;
        initializedProcessIdRef.current = processId;

        // Reset local state when switching to a new simulation id.
        xmlFetchedRef.current = false;
        setXml(null);
        setSimulationData(undefined);
        setWorkload(undefined);
        setCycleTimeData([]);
        setNetworkMetrics(null);
        setNetworkActivity(INITIAL_NETWORK_ACTIVITY_STATE);
        setSmoothAnimation(INITIAL_SMOOTH_ANIMATION_STATE);
        frameCountRef.current = 0;
        lastSecondRef.current = performance.now();

        if (viewerInstanceRef.current) {
            viewerInstanceRef.current.destroy();
            viewerInstanceRef.current = null;
        }

        const fetchSimulationData = async () => {
            try {
                const res = await axios.get(`/api/simulation/${processId}`);
                const bytes = measureResponseBytes(res);
                setNetworkActivity(prev => ({
                    totalBytes: prev.totalBytes + bytes,
                    requestCount: prev.requestCount + 1,
                    samples: [...prev.samples, { t: Date.now(), bytes }],
                }));
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
    }, [processId]);

    useEffect(() => {
        if (xml !== null && simulationData && typeof window !== "undefined") {
            if (viewerInstanceRef.current) return;

            const viewer = new NavigatedViewer({
                container: viewerRef.current,
                additionalModules: [simulation(simulationData, setNumberOfCases, setWaitingProcessingTimes, setNetworkMetrics, setNetworkActivity)]
            });
            viewerInstanceRef.current = viewer;

            viewer.importXML(xml).then(() => {
                const canvas = viewer.get('canvas') as Canvas;
                canvas.zoom('fit-viewport');

                const activityNodeIdMap = getTaskIdToNameMap(viewer);
                setWaitingProcessingTimes(activityNodeIdMap);

                const tokenSimulation = viewer.get('tokenSimulation') as Canvas;
                tokenSimulation.start();
            });
        }
    }, [xml, simulationData]);

    // The open stats panel takes space from the diagram: refit it to the remaining width once the panel has moved
    const statsToggledRef = useRef(false);
    useEffect(() => {
        if (!statsToggledRef.current) {
            statsToggledRef.current = true;
            return;
        }
        const timeout = setTimeout(() => {
            const viewer = viewerInstanceRef.current;
            if (!viewer) return;
            const canvas = viewer.get('canvas') as Canvas & { resized: () => void };
            canvas.resized();
            canvas.zoom('fit-viewport');
        }, 320);
        return () => clearTimeout(timeout);
    }, [statsVisible]);

    // Keyboard shortcuts: Space plays/pauses, Home and End jump to the start and end
    useEffect(() => {
        const actions: Record<string, string> = {" ": "play-pause-btn", Home: "go-to-start-btn", End: "go-to-end-btn"};

        const handleKey = (event: KeyboardEvent) => {
            const buttonId = actions[event.key];
            if (!buttonId || event.ctrlKey || event.metaKey || event.altKey) return;

            // Leave other controls alone (e.g. Space on a focused button or in the speed menu), except the playback
            // buttons, which would otherwise repeat the last one clicked
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
        try {
            await navigator.clipboard.writeText(window.location.href);
            toast.success("Link copied", {description: "Anyone with the link can open this simulation."});
        } catch {
            toast.error("Could not copy the link", {description: window.location.href});
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

    useEffect(() => {
        lastSecondRef.current = performance.now();

        function tick(now: number) {
            frameCountRef.current += 1;
            const elapsed = now - lastSecondRef.current;

            if (elapsed >= 1000) {
                const fps = Math.round(frameCountRef.current * 1000 / elapsed);
                frameCountRef.current = 0;
                lastSecondRef.current = now;

                setSmoothAnimation(prev => {
                    const isFirst = prev.fpsHistory.length === 0;
                    const newHistory = [...prev.fpsHistory, fps].slice(-30);
                    return {
                        currentFps: fps,
                        minFps: isFirst ? fps : Math.min(prev.minFps, fps),
                        maxFps: Math.max(prev.maxFps, fps),
                        averageFps: Math.round(newHistory.reduce((s, f) => s + f, 0) / newHistory.length),
                        fpsHistory: newHistory,
                    };
                });
            }

            rafIdRef.current = requestAnimationFrame(tick);
        }

        rafIdRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(rafIdRef.current);
    }, []);

    const workloadBars = useMemo(() => {
        if (!workload) return null;

        const max = Math.max(...workload);

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
    // "8 Jan", in the time zone of the uploaded log
    const formatChartDate = (date: string) =>
        new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", timeZone: "UTC"}).format(
            new Date(formatInLogTime(new Date(date + "Z"), simulationData?.utcOffset ?? "+00:00").replace(" ", "T") + "Z"));

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
            <span className="toolbar-hint">Space: play/pause · Home/End: jump</span>
        </div>
        <div ref={viewerRef} className={statsVisible ? 'bpmn-viewer with-stats' : 'bpmn-viewer'}></div>
        <div id={'timeline'} className={'timeline'}>
            <div className="timeline-shade-wrapper">
                {workloadBars}
            </div>
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
        <select id={'speed-select'} className={'speed-select'} defaultValue={1}>
            {speeds.map(speed => (
                <option value={speed} key={speed}>{speed}x</option>
            ))}
        </select>

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
                            <div key={nodeId} className="wtpt-row" title={nodeId}>
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
                            </div>
                        );
                    })}
                </div>
                </div>
                <details className="diagnostics">
                    <summary>Diagnostics <span className="stats-unit">(for developers)</span></summary>
                    <NetworkActivityChart state={networkActivity} />
                    {networkMetrics && <BatchQueueChart metrics={networkMetrics} />}
                    <SmoothAnimationPanel
                        state={smoothAnimation}
                        onReset={() => {
                            setSmoothAnimation(INITIAL_SMOOTH_ANIMATION_STATE);
                            frameCountRef.current = 0;
                            lastSecondRef.current = performance.now();
                        }}
                    />
                </details>
            </div>
        </div>
    </>;
}

export default Simulation;
