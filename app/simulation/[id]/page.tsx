"use client";

import {useEffect, useMemo, useRef, useState} from "react";
import { useRouter, useParams } from "next/navigation";
import NavigatedViewer from 'bpmn-js/lib/NavigatedViewer';
import simulation from "@modules/simulation";
import axios from "axios";
import {SimulationData} from "@definitions/api/types";
import {Canvas} from "bpmn-js/lib/features/context-pad/ContextPadProvider";
import {NodeTypes} from "@definitions/simulation/enums";
import {WTPTState} from "@definitions/simulation/types";
import { QueueMetricsState } from "@definitions/simulation/networkMetrics";
import { NetworkActivityChart } from "@components/NetworkActivityChart";

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
    const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
    const router = useRouter();
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

        if (viewerInstanceRef.current) {
            viewerInstanceRef.current.destroy();
            viewerInstanceRef.current = null;
        }

        const fetchSimulationData = async () => {
            try {
                const res = await axios.get(`/api/simulation/${processId}`);
                return res.data;
            } catch {
                router.replace('/');
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
    }, [processId, router]);

    useEffect(() => {
        if (xml !== null && simulationData && typeof window !== "undefined") {
            if (viewerInstanceRef.current) return;

            const viewer = new NavigatedViewer({
                container: viewerRef.current,
                additionalModules: [simulation(simulationData, setNumberOfCases, setWaitingProcessingTimes, setNetworkMetrics)]
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

    const wtptList = useMemo(() => {
        return Object.entries(waitingProcessingTimes)
            .map(([nodeId, stats]) => ({ nodeId, stats }))
            .sort((a, b) => {
                const comparison = a.stats.name.localeCompare(b.stats.name);
                return sortOrder === "asc" ? comparison : -comparison;
            });
    }, [waitingProcessingTimes, sortOrder]);

    return <>
        <div ref={viewerRef} style={{ height: '600px', width: '100%' }}></div>
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
            <button id={'go-to-start-btn'} className={'control-btn'}>⏮</button>
            <button id={'play-pause-btn'} className={'control-btn'}>⏸</button>
            <button id={'go-to-end-btn'} className={'control-btn'}>⏭</button>
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
                    <h3>Average CT</h3>
                    <div className="stats-element-chart">
                        <div className="y-axis"></div>
                        <div className="y-axis-label">CT</div>

                        <div className="x-axis"></div>
                        <div className="x-axis-label">Time</div>

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
                                        <div className="wtpt-bar wtpt-bar-empty" />
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
                {networkMetrics && <NetworkActivityChart metrics={networkMetrics} />}
            </div>
        </div>
    </>;
}

export default Simulation;
