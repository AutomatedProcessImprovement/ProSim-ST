import {Canvas, ElementRegistry, EventBus, Flow, Node, Waypoint} from "@definitions/simulation/interfaces";
import {
    AnimationData,
    Batch,
    BatchEvent,
    ColorMode,
    FrameCase,
    PathMap,
    QueueEntry,
    SimulationHooks,
    TaskLoad,
    Token,
    TokenProgresses,
    Tokens,
    WTPTState
} from "@definitions/simulation/types";
import {FlowTypes, LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";
import axios from "axios";
import {SimulationData} from "@definitions/api/types";
import {formatDuration, formatInLogTime, formatShortDate, formatUtcOffset} from "@utils/dateHelpers";
import {Dispatch, SetStateAction} from "react";
import {buildPathMap, calculateDurations, calculatePathLength} from "@modules/simulation/pathDurationHelpers";
import {buildResumedWTPT, buildTimelineResumptionPatch} from "@modules/simulation/timelineResumptionHelpers";
import {
    calculatePlaybackDelta,
    decidePlaybackSpeedUpdateAction,
    decidePlayPauseResumeAction,
} from "@modules/simulation/playbackStateHelpers";
import {
    computeProportionalDelta,
    computeTokenAnimationStartTime,
    groupEventsByCaseId,
    shouldTopUpQueue,
} from "@modules/simulation/runSimulationHelpers";
import {applyBatchFrameUpdates} from "@modules/simulation/frameUpdateHelpers";
import {
    ageColor,
    classifyRest,
    DOT_RADIUS,
    heatOpacity,
    isTaskType,
    MAX_VISIBLE_DOTS,
    RestPlace,
    slotPosition,
    STATE_COLORS,
} from "@modules/simulation/restLayout";
import {
    batchFetchLimit,
    batchTopUpThreshold,
    DEFAULT_HOURS_PER_SECOND,
    isSummarySpeed,
    msPerSimulatedHour,
} from "@modules/simulation/speed";
import {toUtcMs} from "@utils/processAnalysis";
import { QueueMetricsState } from "@definitions/simulation/networkMetrics";
import { NetworkActivityState, measureResponseBytes } from "@definitions/simulation/networkActivity";

const HOUR = 3600000;
const SVG_NS = "http://www.w3.org/2000/svg";

type Rest = {
    caseId: number;
    tokenId: string;
    elementId: string;
    place: RestPlace;
};

type AnimationTracker = {
    start: () => void;
    done: () => void;
};

const simulation = (
    simulationData: SimulationData,
    caseNumberSetter:  Dispatch<SetStateAction<{
        ongoing: number
        finished: number
    }>>,
    wtptSetter: Dispatch<SetStateAction<WTPTState>>,
    queueMetricsSetter: Dispatch<SetStateAction<QueueMetricsState>>,
    networkActivitySetter: Dispatch<SetStateAction<NetworkActivityState>>,
    hooks: SimulationHooks = {},
) => {
    const tokenSimulation = function(canvas: Canvas, elementRegistry: ElementRegistry, eventBus?: EventBus) {
            let processId: string;
            const defaultDelta = msPerSimulatedHour(1); // milliseconds per simulated hour at 1 hour/s
            let delta = msPerSimulatedHour(DEFAULT_HOURS_PER_SECOND);
            let tokens: Tokens = {};
            let totalDuration: number;
            let viewport: SVGGElement;
            let tokenLayer: SVGGElement;
            let badgeLayer: SVGGElement;
            const timeline = document.getElementById('timeline');
            const progressBar = document.getElementById('progress-bar');
            const pointer = document.getElementById('pointer');
            const tooltip = document.getElementById('timeline-tooltip');
            const tokenTooltip = document.getElementById('token-tooltip');
            const ctTimeBar = document.getElementById('cycle-time-chart-time-bar');
            let currentProgress: number = 0.0;
            const currentDateTimeBox = document.getElementById('simulated-time-box');
            let currentDateTime: Date;
            let localProgress: number = 0.0;
            let tokenProgresses: TokenProgresses = {};
            let batchesQueue: Batch[];
            let currentBatch: Batch;
            // Taken from the queue but not applied yet: replayed when playback restarts
            let currentBatchUnfinished = false;
            let frames: FrameCase[];
            let batchesPointer = 0;
            const playPauseButton = document.getElementById('play-pause-btn');
            let isPaused = false;
            let isResumed = false;
            let fetchPromise: Promise<void> | null = null;
            // Bumped on every jump in time, so batches still being loaded for the old position are dropped
            let queueGeneration = 0;
            let initialDate: Date;
            let finalDate: Date;
            let utcOffset = "+00:00";
            let abortController: AbortController = new AbortController();
            let hasEnded = false;
            let currentBatchIndex = 0;
            let colorMode: ColorMode = "state";
            let agePaintInterval: ReturnType<typeof setInterval> | null = null;

            // Where every case that is not moving rests, grouped by the element its dots are laid out on
            const rests = new Map<string, Rest>();
            const groups = new Map<string, Set<string>>();
            const animating = new Set<string>();
            const taskCounts = new Map<string, {waiting: number; inWork: number}>();
            const dirtyGroups = new Set<string>();
            let layoutScheduled = false;
            const pills = new Map<string, {waiting: SVGGElement; inWork: SVGGElement}>();
            const shadedTasks = new Set<string>();
            // bpmn-js styles shapes inline, so the task's own fill is kept to put back when its queue empties
            const originalFills = new Map<string, string>();
            let lastLoadReport = 0;
            let loadReportTimeout: ReturnType<typeof setTimeout> | null = null;

            // What is known about each case: when it arrived, and when it started waiting for or working on a task
            const taskTimes = new Map<number, Map<string, {enabled?: number; started?: number}>>();
            const seenArrivals = new Map<number, number>();

            const tokenKey = (caseId: number, tokenId: string) => `${caseId}|${tokenId}`;

            function getElement(elementId: string): Flow | Node | undefined {
                return elementRegistry.get(elementId);
            }

            function getNodeTypeFromRegistry(elementId: string): string | undefined {
                return getElement(elementId)?.type;
            }

            function elementName(elementId: string) {
                return getElement(elementId)?.businessObject?.name?.trim() || elementId;
            }

            function calculateCenterPoint(shape: Node): Waypoint {
                const {x, y, width, height} = shape;

                return {
                    x: x + width / 2,
                    y: y + height / 2,
                }
            }

            function getTokenCoordinates(token: Token): Waypoint {
                return {
                    x: Number(token.getAttribute("cx")),
                    y: Number(token.getAttribute("cy")),
                }
            }

            function setTokenPosition(token: Token, {x, y}: Waypoint) {
                token.setAttribute("cx", x.toString());
                token.setAttribute("cy", y.toString());
            }

            // ---- Colours ----

            function caseArrival(caseId: number): number | null {
                return hooks.getCaseArrival?.(caseId) ?? seenArrivals.get(caseId) ?? null;
            }

            function now() {
                return currentDateTime?.getTime() ?? initialDate?.getTime() ?? 0;
            }

            function tokenColor(caseId: number, tokenId: string) {
                if (colorMode === "age") {
                    const arrival = caseArrival(caseId);
                    return ageColor(arrival === null ? null : now() - arrival, hooks.getAverageCycleTime?.() ?? null);
                }
                const rest = rests.get(tokenKey(caseId, tokenId));
                return STATE_COLORS[rest ? rest.place.kind : "moving"];
            }

            function paintToken(caseId: number, tokenId: string) {
                tokens[caseId]?.[tokenId]?.setAttribute("fill", tokenColor(caseId, tokenId));
            }

            function paintAllTokens() {
                Object.entries(tokens).forEach(([caseId, caseTokens]) => {
                    Object.keys(caseTokens).forEach(tokenId => paintToken(Number(caseId), tokenId));
                });
            }

            // ---- Resting places ----

            function adjustTaskCount(place: RestPlace, change: number) {
                if (!place.taskId || (place.kind !== "waiting" && place.kind !== "working")) return;
                const counts = taskCounts.get(place.taskId) ?? {waiting: 0, inWork: 0};
                if (place.kind === "waiting") counts.waiting += change;
                else counts.inWork += change;
                taskCounts.set(place.taskId, counts);
            }

            function markDirty(groupId: string) {
                dirtyGroups.add(groupId);
                if (layoutScheduled) return;
                layoutScheduled = true;
                requestAnimationFrame(flushLayout);
            }

            function removeRest(key: string) {
                const rest = rests.get(key);
                if (!rest) return;
                rests.delete(key);
                groups.get(rest.place.groupId)?.delete(key);
                adjustTaskCount(rest.place, -1);
                markDirty(rest.place.groupId);
            }

            // The case stopped at the element: line its dot up with the others there
            function settle(caseId: number, tokenId: string, elementId: string) {
                const key = tokenKey(caseId, tokenId);
                removeRest(key);
                if (!tokens[caseId]?.[tokenId]) return;

                const place = classifyRest(elementId, getElement(elementId));
                if (place) {
                    rests.set(key, {caseId, tokenId, elementId, place});
                    if (!groups.has(place.groupId)) groups.set(place.groupId, new Set());
                    groups.get(place.groupId).add(key);
                    adjustTaskCount(place, 1);
                    markDirty(place.groupId);
                }
                paintToken(caseId, tokenId);
            }

            // The case starts moving: take its dot out of the line
            function unsettle(caseId: number, tokenId: string) {
                removeRest(tokenKey(caseId, tokenId));
                const token = tokens[caseId]?.[tokenId];
                if (!token) return;
                token.style.visibility = "";
                paintToken(caseId, tokenId);
            }

            function sinceOf(rest: Rest): number | null {
                const times = rest.place.taskId ? taskTimes.get(rest.caseId)?.get(rest.place.taskId) : undefined;
                if (rest.place.kind === "waiting") return times?.enabled ?? null;
                if (rest.place.kind === "working") return times?.started ?? null;
                return null;
            }

            function layoutGroup(groupId: string) {
                const element = getElement(groupId);
                const members = [...(groups.get(groupId) ?? [])]
                    .map(key => rests.get(key))
                    .filter((rest): rest is Rest => Boolean(rest));
                if (!members.length) groups.delete(groupId);
                if (!element || !members.length) return;

                // First in line nearest to the task
                members.sort((a, b) => (sinceOf(a) ?? 0) - (sinceOf(b) ?? 0));
                const visible = Math.min(members.length, MAX_VISIBLE_DOTS);
                members.forEach((rest, index) => {
                    const token = tokens[rest.caseId]?.[rest.tokenId];
                    if (!token) return;
                    setTokenPosition(token, slotPosition(element, Math.min(index, visible - 1), visible));
                    token.style.visibility = index < MAX_VISIBLE_DOTS ? "" : "hidden";
                });
            }

            function flushLayout() {
                layoutScheduled = false;
                dirtyGroups.forEach(layoutGroup);
                dirtyGroups.clear();
                renderLoad();
            }

            // ---- Counts and shading per task ----

            function createPill(taskId: string, className: string): SVGGElement {
                const group = document.createElementNS(SVG_NS, "g");
                group.classList.add("load-pill", className);
                group.setAttribute("data-task", taskId);
                group.appendChild(document.createElementNS(SVG_NS, "rect"));
                group.appendChild(document.createElementNS(SVG_NS, "text"));
                group.addEventListener("click", () => hooks.onTaskClick?.(taskId));
                badgeLayer.appendChild(group);
                return group;
            }

            function updatePill(pill: SVGGElement, label: string | null, x: number, y: number, centred: boolean) {
                if (!label) {
                    pill.style.display = "none";
                    return;
                }
                const width = label.length * 7.4 + 14;
                const left = centred ? x - width / 2 : x;
                const rect = pill.querySelector("rect");
                const text = pill.querySelector("text");
                pill.style.display = "";
                rect.setAttribute("x", left.toString());
                rect.setAttribute("y", y.toString());
                rect.setAttribute("width", width.toString());
                rect.setAttribute("height", "19");
                rect.setAttribute("rx", "9.5");
                text.setAttribute("x", (left + width / 2).toString());
                text.setAttribute("y", (y + 14).toString());
                text.textContent = label;
            }

            function renderLoad() {
                if (!badgeLayer) return;
                let maxWaiting = 0;
                taskCounts.forEach(({waiting}) => { maxWaiting = Math.max(maxWaiting, waiting); });

                const taskIds = new Set([...taskCounts.keys(), ...shadedTasks, ...pills.keys()]);
                taskIds.forEach(taskId => {
                    const shape = getElement(taskId) as Node | undefined;
                    if (!shape) return;
                    const {waiting = 0, inWork = 0} = taskCounts.get(taskId) ?? {};

                    const rect = elementRegistry.getGraphics?.(taskId)?.querySelector<SVGRectElement>(".djs-visual > rect");
                    const opacity = heatOpacity(waiting, maxWaiting);
                    if (rect) {
                        if (!originalFills.has(taskId)) originalFills.set(taskId, rect.style.fill);
                        rect.style.fill = opacity ? `rgba(245, 158, 11, ${opacity.toFixed(2)})` : originalFills.get(taskId);
                    }
                    if (opacity) shadedTasks.add(taskId);
                    else shadedTasks.delete(taskId);

                    let taskPills = pills.get(taskId);
                    if (!taskPills && (waiting > MAX_VISIBLE_DOTS || inWork > MAX_VISIBLE_DOTS)) {
                        taskPills = {waiting: createPill(taskId, "waiting"), inWork: createPill(taskId, "in-work")};
                        pills.set(taskId, taskPills);
                    }
                    if (!taskPills) return;
                    updatePill(taskPills.waiting, waiting > MAX_VISIBLE_DOTS ? `${waiting} waiting` : null,
                        shape.x, shape.y - 23, false);
                    updatePill(taskPills.inWork, inWork > MAX_VISIBLE_DOTS ? `${inWork} in work` : null,
                        shape.x + shape.width / 2, shape.y + shape.height + 18, true);
                });

                reportLoad();
            }

            // Tells the page how busy every task is, at most four times a second
            function reportLoad() {
                if (!hooks.onTaskLoad || loadReportTimeout) return;
                const wait = Math.max(0, 250 - (performance.now() - lastLoadReport));
                loadReportTimeout = setTimeout(() => {
                    loadReportTimeout = null;
                    lastLoadReport = performance.now();
                    const load: TaskLoad = {};
                    taskCounts.forEach((counts, taskId) => { load[taskId] = {...counts}; });
                    hooks.onTaskLoad?.(load);
                }, wait);
            }

            // ---- Case history (for "waiting for 6 h" and "case open 2 d") ----

            function noteBatchEvents(events: BatchEvent[]) {
                events.forEach(event => {
                    const timestamp = toUtcMs(event.timestamp);
                    if (event.lifecycle === LifecycleTypes.CASE_ARRIVAL) {
                        if (!seenArrivals.has(event.caseId)) seenArrivals.set(event.caseId, timestamp);
                        return;
                    }
                    if (event.lifecycle === LifecycleTypes.CASE_END) {
                        taskTimes.delete(event.caseId);
                        return;
                    }
                    if (!event.nodeId) return;
                    if (!taskTimes.has(event.caseId)) taskTimes.set(event.caseId, new Map());
                    const caseTasks = taskTimes.get(event.caseId);
                    if (event.lifecycle === LifecycleTypes.ENABLE) caseTasks.set(event.nodeId, {enabled: timestamp});
                    else if (event.lifecycle === LifecycleTypes.START) caseTasks.set(event.nodeId, {...caseTasks.get(event.nodeId), started: timestamp});
                    else if (event.lifecycle === LifecycleTypes.COMPLETE) caseTasks.delete(event.nodeId);
                });
            }

            function seedTaskTimes(wtpt: WTPTState | undefined) {
                taskTimes.clear();
                Object.entries(wtpt ?? {}).forEach(([taskId, stats]) => {
                    Object.entries(stats.incompleteCases ?? {}).forEach(([caseId, times]) => {
                        const id = Number(caseId);
                        if (!taskTimes.has(id)) taskTimes.set(id, new Map());
                        taskTimes.get(id).set(taskId, {enabled: times.enablementTime, started: times.startTime});
                    });
                });
            }

            // ---- Hover details ----

            function describeToken(caseId: number, tokenId: string): string[] {
                const lines = [`Case ${caseId}`];
                const rest = rests.get(tokenKey(caseId, tokenId));
                const since = rest ? sinceOf(rest) : null;
                const here = since !== null ? ` for ${formatDuration(now() - since)}` : "";

                if (!rest) lines.push("Moving");
                else if (rest.place.kind === "waiting") lines.push(`Waiting for ${elementName(rest.place.taskId)}${here}`);
                else if (rest.place.kind === "working") lines.push(`In work: ${elementName(rest.place.taskId)}${here}`);
                else if (rest.place.kind === "sync") lines.push("Waiting for its parallel branches");
                else lines.push(`At ${elementName(rest.elementId)}`);

                const arrival = caseArrival(caseId);
                if (arrival !== null && arrival <= initialDate.getTime()) {
                    lines.push(`Open since before ${formatShortDate(initialDate, utcOffset, true)}`);
                } else if (arrival !== null) {
                    lines.push(`Case open ${formatDuration(now() - arrival)}`);
                }
                return lines;
            }

            function enableTokenHover() {
                if (!tokenTooltip) return;

                const show = (event: MouseEvent) => {
                    const target = event.target as Element;
                    if (!target.classList?.contains("token")) return;
                    const lines = describeToken(Number(target.getAttribute("data-case")), target.getAttribute("data-token"));
                    tokenTooltip.replaceChildren(...lines.map((line, index) => {
                        const div = document.createElement("div");
                        if (index === 0) div.className = "token-tooltip-title";
                        div.textContent = line;
                        return div;
                    }));
                    tokenTooltip.style.display = "block";
                    move(event);
                };
                const move = (event: MouseEvent) => {
                    tokenTooltip.style.left = `${event.clientX + 12}px`;
                    tokenTooltip.style.top = `${event.clientY + 12}px`;
                };
                const hide = () => { tokenTooltip.style.display = "none"; };

                tokenLayer.addEventListener("mouseover", show);
                tokenLayer.addEventListener("mousemove", move);
                tokenLayer.addEventListener("mouseout", hide);
            }

            // ---- Dots ----

            function hasTokens(caseId: number) {
                return Boolean(tokens[caseId] && Object.keys(tokens[caseId]).length);
            }

            function createToken(
                activeElementId: string,
                caseId: number,
                tokenId: string,
                {show = true, fadeIn = false, rest = false}: {show?: boolean; fadeIn?: boolean; rest?: boolean} = {},
            ): Token | undefined {
                if (!tokens[caseId]) tokens[caseId] = {};
                const activeElement = getElement(activeElementId);
                if (!activeElement) return undefined;

                let point: Waypoint;
                if (activeElement.type === FlowTypes.FLOW) {
                    const waypoints = activeElement.waypoints;
                    if (!waypoints?.length) return undefined;
                    point = waypoints[waypoints.length - 1];
                } else point = calculateCenterPoint(activeElement);

                const token = document.createElementNS(SVG_NS, "circle");
                token.setAttribute("r", DOT_RADIUS.toString());
                token.setAttribute("data-case", caseId.toString());
                token.setAttribute("data-token", tokenId);
                token.classList.add("token");
                setTokenPosition(token, point);
                tokens[caseId][tokenId] = token;

                if (show) {
                    if (fadeIn) {
                        token.style.animationDuration = `2s`;
                        token.classList.add("fade-in");
                        token.addEventListener("animationend", () => {
                            token.classList.remove("fade-in");
                        });
                    }
                    tokenLayer.appendChild(token);
                }

                if (rest) settle(caseId, tokenId, activeElementId);
                else paintToken(caseId, tokenId);
                return token;
            }

            function deleteToken(caseId: number, tokenId: string, fadeOut: boolean = false) {
                const token = tokens[caseId]?.[tokenId];
                if (!token) return;
                const key = tokenKey(caseId, tokenId);
                removeRest(key);
                animating.delete(key);

                function processDeletion() {
                    token.remove();
                    if (tokens[caseId]?.[tokenId] === token) delete tokens[caseId][tokenId];
                }

                if (fadeOut) {
                    token.style.animationDuration = `2s`;
                    token.classList.add("fade-out");
                    token.addEventListener("animationend", processDeletion);
                } else processDeletion();
            }

            function clearTokens() {
                tokenLayer?.replaceChildren();
                tokens = {};
                rests.clear();
                groups.clear();
                animating.clear();
                taskCounts.clear();
                dirtyGroups.clear();
                renderLoad();
            }

            // Makes the dots match where the cases are: adds missing ones, removes the ones of finished or merged
            // branches, and lines up every dot that is not moving
            function reconcileWithFrames() {
                const active = new Map(frames.map(frame => [frame.caseId, frame.activeElements]));

                Object.entries(tokens).forEach(([caseIdKey, caseTokens]) => {
                    const caseId = Number(caseIdKey);
                    const elements = active.get(caseId);
                    Object.entries(caseTokens).forEach(([tokenId, token]) => {
                        if (token.classList.contains("fade-out")) return;
                        if (!elements || !(tokenId in elements)) deleteToken(caseId, tokenId);
                    });
                    if (!Object.keys(caseTokens).length) delete tokens[caseId];
                });

                active.forEach((elements, caseId) => {
                    Object.entries(elements).forEach(([tokenId, elementId]) => {
                        const token = tokens[caseId]?.[tokenId];
                        if (!token) {
                            createToken(elementId, caseId, tokenId, {rest: true});
                            return;
                        }
                        if (!token.isConnected) tokenLayer.appendChild(token);
                        const key = tokenKey(caseId, tokenId);
                        if (!animating.has(key) && rests.get(key)?.elementId !== elementId) settle(caseId, tokenId, elementId);
                    });
                });
            }

            function handleBatchEvents({caseId, batchEvents, batchDuration}: { caseId: number; batchEvents: Array<BatchEvent>; batchDuration: number }): Promise<void> {
                function addCentralPointToPath(element: Node, path: Array<Waypoint>, animationData: AnimationData, tokenId: string) {
                    const centerPoint = calculateCenterPoint(element);
                    const lastPoint = path.length ?
                        path[path.length - 1] :
                        animationData[tokenId].path[animationData[tokenId].path.length - 1];
                    if (lastPoint.x !== centerPoint.x || lastPoint.y !== centerPoint.y) path.push(centerPoint);
                }

                function addElementsToPath(
                    animationData: AnimationData,
                    tokenId: string,
                    caseId: number,
                    elements: Array<string>,
                    batchEventPathEntries: Array<[string, Array<string>]>
                ): { path: Array<Waypoint>, nextTokenIds: Array<string> } {
                    let path: Array<Waypoint> = [];
                    let nextTokenIds: Array<string> = [];

                    if (!animationData[tokenId]) path.push(getTokenCoordinates(tokens[caseId][tokenId]));
                    elements.forEach((elementId, index) => {
                        const element = getElement(elementId);
                        if (!element) {
                            console.warn(`The element ${elementId} does not exist!`);
                            return;
                        }

                        if (element.type === FlowTypes.FLOW) path = [...path, ...element.waypoints];
                        else {
                            addCentralPointToPath(element, path, animationData, tokenId);

                            if (element.type === NodeTypes.PARALLEL_GATEWAY && index === elements.length - 1) {
                                nextTokenIds = batchEventPathEntries
                                    .filter(([otherTokenId, otherElements]) =>
                                        otherElements[0] === elementId &&
                                        otherTokenId !== tokenId &&
                                        otherElements.length > 1
                                    )
                                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                                    .map(([otherTokenId, _]) => otherTokenId);
                            }
                        }
                    });

                    return { path, nextTokenIds };
                }

                return new Promise((resolve: () => void, reject) => {
                    abortController.signal.addEventListener("abort", () => {
                        reject(new Error("Simulation aborted"));
                    });

                    // The case is done once every one of its dots has finished moving
                    let pending = 0;
                    const tracker: AnimationTracker = {
                        start: () => { pending++; },
                        done: () => { if (--pending === 0) resolve(); },
                    };

                    const animationData: AnimationData = {};
                    const finalElements: Record<string, string> = {};
                    const isAsyncAnimation = batchEvents.some(batchEvent => Object.keys(batchEvent.paths).length > 1)

                    // Where the dot ends up after this batch: gone for a finished case or a branch merged at a
                    // parallel join, otherwise lined up at the element it stopped at
                    const finishToken = (tokenId: string, lifecycle: LifecycleTypes) => {
                        const finalElement = finalElements[tokenId];
                        if (lifecycle === LifecycleTypes.CASE_END) deleteToken(caseId, tokenId, true);
                        else if (isAsyncAnimation && getNodeTypeFromRegistry(finalElement) === NodeTypes.PARALLEL_GATEWAY) deleteToken(caseId, tokenId);
                        else settle(caseId, tokenId, finalElement);
                    };

                    const addToAnimation = (batchEvent: BatchEvent, tokenId: string, elements: string[], entries: Array<[string, Array<string>]>) => {
                        if (!tokens[caseId]?.[tokenId] || !elements.length) return;
                        const {path, nextTokenIds} = addElementsToPath(animationData, tokenId, caseId, elements, entries);
                        animationData[tokenId] = animationData[tokenId]
                            ? {path: [...animationData[tokenId].path, ...path], nextTokenIds}
                            : {path, nextTokenIds};
                        animationData[tokenId].onComplete = () => finishToken(tokenId, batchEvent.lifecycle);
                        finalElements[tokenId] = elements[elements.length - 1];
                    };

                    batchEvents.forEach(batchEvent => {
                        const batchEventPathEntries = Object.entries(batchEvent.paths);
                        if (isAsyncAnimation) {
                            batchEventPathEntries.forEach(([tokenId, elements]) => {
                                if (!tokens[caseId]?.[tokenId]) {
                                    // A new branch stays hidden until the dot it splits from reaches it
                                    const show = !hasTokens(caseId);
                                    createToken(elements[0], caseId, tokenId, {
                                        show,
                                        fadeIn: show && (!isResumed || !tokenProgresses[caseId]?.[tokenId]),
                                    });
                                }
                                addToAnimation(batchEvent, tokenId, elements, batchEventPathEntries);
                            });
                        } else if (batchEventPathEntries.length) {
                            const [tokenId, elements] = batchEventPathEntries[0];
                            if (!tokens[caseId]?.[tokenId]) {
                                createToken(elements[0], caseId, tokenId, {fadeIn: !isResumed || !tokenProgresses[caseId]?.[tokenId]});
                            }
                            addToAnimation(batchEvent, tokenId, elements, batchEventPathEntries);
                        }
                    });

                    if (isAsyncAnimation) animateAsyncData(buildPathMap(animationData), caseId, batchDuration, false, new Set(), tracker);
                    else Object.entries(animationData).forEach(([tokenId, {path, onComplete}]) => {
                        animateToken(path, onComplete, caseId, tokenId, batchDuration, tracker);
                    });

                    if (pending === 0) setTimeout(resolve, batchDuration * (1 - (isResumed ? localProgress : 0)));
                    // Never hold the playback up for a dot that does not arrive
                    else setTimeout(resolve, batchDuration * 2 + 1000);
                });
            }

            function animateAsyncData(pathMap: PathMap, caseId: number, remainingDuration: number, isHidden: boolean, animatedTokens: Set<string>, tracker: AnimationTracker) {
                const durations = calculateDurations(pathMap, animatedTokens, remainingDuration);

                Object.entries(pathMap).forEach(([tokenId, tokenData]) => {
                    if (animatedTokens.has(tokenId)) return;

                    const token = tokens[caseId]?.[tokenId];
                    if (!token) return;
                    if (isHidden || !token.isConnected) tokenLayer.appendChild(token);
                    const duration = durations[tokenId];
                    const onComplete = () => {
                        if (Object.keys(tokenData.subPaths).length) {
                            deleteToken(caseId, tokenId);
                            animateAsyncData(tokenData.subPaths, caseId, remainingDuration - duration, true, animatedTokens, tracker);
                        } else {
                            tokenData.onComplete();
                        }
                    }
                    animatedTokens.add(tokenId);
                    animateToken(tokenData.path, onComplete, caseId, tokenId, duration, tracker);
                });
            }

            function animateToken(path: Waypoint[], onComplete: () => void, caseId: number, tokenId: string, duration: number, tracker: AnimationTracker) {
                const key = tokenKey(caseId, tokenId);
                tracker.start();
                animating.add(key);
                unsettle(caseId, tokenId);

                // Durations of merging branches can come out infinite or negative when a branch has no length left
                const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
                const startTime = computeTokenAnimationStartTime(
                    performance.now(),
                    safeDuration,
                    isResumed,
                    tokenProgresses[caseId]?.[tokenId],
                );
                const pathLength = calculatePathLength(path);
                const signal = abortController.signal;

                function animate() {
                    if (signal.aborted) return;
                    const token = tokens[caseId]?.[tokenId];

                    const elapsedTime = performance.now() - startTime;
                    const progress = safeDuration > 0 ? Math.min(elapsedTime / safeDuration, 1) : 1;
                    const currentDistance = progress * pathLength;

                    let accumulatedDistance = 0;
                    for (let i = 0; token && i < path.length - 1; i++) {
                        const segmentStart = path[i];
                        const segmentEnd = path[i + 1];
                        const dx = segmentEnd.x - segmentStart.x;
                        const dy = segmentEnd.y - segmentStart.y;
                        const segmentLength = Math.sqrt(dx * dx + dy * dy);

                        if (accumulatedDistance + segmentLength >= currentDistance) {
                            const segmentProgress = segmentLength ? (currentDistance - accumulatedDistance) / segmentLength : 1;
                            setTokenPosition(token, {
                                x: segmentStart.x + dx * segmentProgress,
                                y: segmentStart.y + dy * segmentProgress,
                            });
                            break;
                        }

                        accumulatedDistance += segmentLength;
                    }

                    if (!tokenProgresses[caseId]) tokenProgresses[caseId] = {};
                    tokenProgresses[caseId][tokenId] = progress;

                    if (progress < 1) requestAnimationFrame(animate);
                    else {
                        animating.delete(key);
                        onComplete();
                        tracker.done();
                    }
                }

                requestAnimationFrame(animate);
            }

            // ---- Clock and timeline ----

            // Times are shown as they appear in the uploaded log, i.e. in its UTC offset
            function formatTime(date: Date) {
                return formatInLogTime(date, utcOffset);
            }

            function showCurrentTime(progress: number) {
                currentDateTime = new Date(initialDate.getTime() + progress * totalDuration);
                currentDateTimeBox.textContent = `${formatTime(currentDateTime)} ${formatUtcOffset(utcOffset)}`;
            }

            function showProgress(progress: number) {
                const progressPercentage = `${progress * 100}%`;
                progressBar.style.width = progressPercentage;
                pointer.style.left = progressPercentage;
                ctTimeBar.style.width = `calc((100% - 24px) * ${progress})`;
                showCurrentTime(progress);
            }

            function enableTimeline() {
                const startDate = document.getElementById("start-date");
                startDate.textContent = formatTime(initialDate);
                const endDate = document.getElementById("end-date");
                endDate.textContent = formatTime(finalDate);

                const goToStartButton = document.getElementById('go-to-start-btn');
                goToStartButton.addEventListener("click", () => handleRewindButtonClick(0));
                playPauseButton.addEventListener("click", handlePlayPause);
                const goToEndButton = document.getElementById("go-to-end-btn");
                goToEndButton.addEventListener("click", () => handleRewindButtonClick(100));

                const speedSelect = document.getElementById("speed-select");
                speedSelect.addEventListener("change", (event) => {
                    const newSpeed = parseFloat((event.target as HTMLSelectElement).value);
                    updatePlaybackSpeed(newSpeed);
                });

                enableTimelineDragging();
                enableTimelineHover();
            }

            // Moves the clock through one batch; resolves when the batch's time has passed
            function animateTimeline(batchDuration: number): Promise<void> {
                return new Promise((resolve, reject) => {
                    const signal = abortController.signal;
                    let startTime = performance.now();
                    if (isResumed && localProgress) {
                        const proportionalDelta = delta * batchDuration / HOUR;
                        startTime -= localProgress * proportionalDelta;
                    }

                    function animate() {
                        if (signal.aborted) {
                            reject(new Error("Simulation aborted"));
                            return;
                        }

                        const elapsedTime = Math.min((performance.now() - startTime) / delta * HOUR, batchDuration);
                        const progress = Math.min(currentProgress + elapsedTime / totalDuration, 1);
                        const innerProgress = batchDuration > 0 ? elapsedTime / batchDuration : 1;

                        showProgress(progress);

                        if (innerProgress < 1) {
                            localProgress = innerProgress;
                            requestAnimationFrame(animate);
                        } else {
                            currentProgress = progress;
                            localProgress = 0.0;
                            resolve();
                        }
                    }

                    requestAnimationFrame(animate);
                });
            }

            function enableTimelineDragging() {
                let isDragging = false;

                function updateProgress(event: MouseEvent | TouchEvent) {
                    if (!isDragging) return;

                    const rect = timeline.getBoundingClientRect();
                    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
                    const progress = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));

                    currentProgress = progress / 100;
                    showProgress(currentProgress);
                }

                function handleDragStart(event: MouseEvent | TouchEvent) {
                    isDragging = true;
                    abortController.abort();
                    updateProgress(event);
                }

                async function handleDragEnd(event: MouseEvent | TouchEvent) {
                    if (!isDragging) return;
                    isDragging = false;

                    const rect = timeline.getBoundingClientRect();
                    const clientX = event instanceof MouseEvent ? event.clientX : event.changedTouches[0].clientX;
                    const progress = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));

                    await handleTimelineRequest(progress);
                }

                timeline.addEventListener("mousedown", handleDragStart);
                timeline.addEventListener("touchstart", handleDragStart);
                document.addEventListener("mousemove", updateProgress);
                document.addEventListener("touchmove", updateProgress);
                document.addEventListener("mouseup", handleDragEnd);
                document.addEventListener("touchend", handleDragEnd);
            }

            function enableTimelineHover() {
                function updateTooltip(event: MouseEvent) {
                    const rect = timeline.getBoundingClientRect();
                    const progress = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
                    const moment = new Date(initialDate.getTime() + (progress / 100) * totalDuration);
                    const extra = hooks.describeMoment?.(moment.getTime());

                    tooltip.textContent = extra ? `${formatTime(moment)} · ${extra}` : formatTime(moment);
                    tooltip.style.left = `${event.clientX + 10}px`;
                    tooltip.style.top = `${event.clientY - 30}px`;
                    tooltip.style.display = "block";
                }

                function hideTooltip() {
                    tooltip.style.display = "none";
                }

                timeline.addEventListener("mousemove", updateTooltip);
                timeline.addEventListener("mouseleave", hideTooltip);
            }

            // ---- Playback controls ----

            function handleRewindButtonClick(progress: number) {
                abortController.abort();

                currentProgress = progress / 100;
                showProgress(currentProgress);

                handleTimelineRequest(progress);
            }

            function finishPlayback() {
                playPauseButton.innerHTML = " ▶";
                isPaused = true;
                hasEnded = true;
            }

            function handlePlayPause() {
                const action = decidePlayPauseResumeAction({
                    isPaused,
                    hasEnded,
                    batchesQueue,
                    currentBatch,
                    localProgress,
                    currentBatchUnfinished,
                });

                if (action.kind === "pause") {
                    playPauseButton.innerHTML = " ▶";
                    isPaused = true;
                    abortController.abort();
                    return;
                }

                if (action.kind === "restart") {
                    hasEnded = false;
                    currentProgress = 0.0;
                    showCurrentTime(0);
                    handleTimelineRequest(0);
                    return;
                }

                batchesQueue = action.nextQueue;
                currentBatchUnfinished = false;
                playPauseButton.innerHTML = "⏸";
                clearTokens();
                isPaused = false;
                isResumed = action.resetPatch.isResumed;
                abortController = new AbortController();
                setTimeout(runSimulation, 10);
            }

            function updatePlaybackSpeed(newSpeed: number) {
                const action = decidePlaybackSpeedUpdateAction({
                    isPaused,
                    batchesQueue,
                    currentBatch,
                    localProgress,
                    currentBatchUnfinished,
                });

                if (action.kind === "running") {
                    abortController.abort();

                    setTimeout(() => {
                        batchesQueue = action.nextQueue;
                        currentBatchUnfinished = false;
                        clearTokens();
                        isResumed = action.resetPatch.isResumed;
                        delta = calculatePlaybackDelta(defaultDelta, newSpeed);
                        abortController = new AbortController();
                        setTimeout(runSimulation, 10);
                    }, 300);
                } else {
                    delta = calculatePlaybackDelta(defaultDelta, newSpeed);
                }
            }

            async function handleTimelineRequest(progress: number) {
                try {
                    const res = await axios.post(`/api/simulation/${processId}/resumption`, {
                        requestedDate: new Date(initialDate.getTime() + (progress / 100) * totalDuration).toISOString(),
                    });

                    const patch = buildTimelineResumptionPatch(res.data, isPaused);

                    queueGeneration++;
                    clearTokens();
                    tokenProgresses = patch.tokenProgresses;
                    localProgress = patch.localProgress;
                    batchesQueue = patch.batchesQueue;
                    currentBatchUnfinished = false;
                    frames = patch.frames;
                    batchesPointer = patch.batchesPointer;
                    seedTaskTimes(res.data.wtpt);

                    currentBatchIndex = Math.round((progress / 100) * Math.ceil(totalDuration / HOUR));
                    queueMetricsSetter(prev => ({
                        totalBatches: prev.totalBatches,
                        totalDuration: prev.totalDuration,
                        samples: [{ batchIndex: currentBatchIndex, queueLength: patch.batchesQueue.length }],
                    }));

                    const resumptionBytes = measureResponseBytes(res);
                    networkActivitySetter({
                        totalBytes: resumptionBytes,
                        requestCount: 1,
                        samples: [{ t: Date.now(), bytes: resumptionBytes }],
                    });

                    caseNumberSetter(patch.caseNumbers);

                    wtptSetter(prev => buildResumedWTPT(prev, res.data.wtpt));

                    if (patch.shouldUnpause) {
                        isPaused = false;
                        playPauseButton.innerHTML = "⏸";
                    }
                    hasEnded = false;
                    abortController = new AbortController();
                    setTimeout(runSimulation, 10);
                } catch (error) {
                    console.log(error);
                }
            }

            // ---- Loading batches ----

            function emitQueueSample(queueLength: number) {
                queueMetricsSetter(prev => ({
                    ...prev,
                    samples: [...prev.samples.slice(-49), {
                        batchIndex: currentBatchIndex,
                        queueLength,
                    }],
                }));
            }

            function topBatchesQueueUp(): Promise<void> {
                if (fetchPromise) return fetchPromise;
                const generation = queueGeneration;

                fetchPromise = (async () => {
                    try {
                        const res = await axios.get(`/api/simulation/${processId}/polling?pointer=${batchesPointer}&limit=${batchFetchLimit(delta)}`);
                        const bytes = measureResponseBytes(res);
                        networkActivitySetter(prev => ({
                            totalBytes: prev.totalBytes + bytes,
                            requestCount: prev.requestCount + 1,
                            samples: [...prev.samples, { t: Date.now(), bytes }],
                        }));
                        if (generation !== queueGeneration) return;
                        batchesQueue.push(...res.data.batches);
                        batchesPointer = res.data.pointer;
                        emitQueueSample(batchesQueue.length);
                    } catch (error) {
                        console.log(error);
                    } finally {
                        fetchPromise = null;
                    }
                })();
                return fetchPromise;
            }

            function topUpIfNeeded() {
                if (shouldTopUpQueue(batchesQueue.length, batchesPointer, batchTopUpThreshold(delta))) {
                    topBatchesQueueUp();
                }
            }

            // Waits for more batches when the queue ran dry; false when there is nothing more to play
            async function waitForBatches(signal: AbortSignal): Promise<boolean> {
                while (!batchesQueue.length && batchesPointer > 0) {
                    await topBatchesQueueUp();
                    if (signal.aborted) return false;
                    if (!batchesQueue.length) await new Promise(resolve => setTimeout(resolve, 1000));
                    if (signal.aborted) return false;
                }
                return batchesQueue.length > 0;
            }

            function applyBatch(batch: Batch) {
                frames = applyBatchFrameUpdates({
                    frames,
                    batch,
                    getNodeType: getNodeTypeFromRegistry,
                    caseNumberSetter,
                    wtptSetter,
                });
            }

            // ---- Playing ----

            function runSimulation() {
                return isSummarySpeed(delta) ? runSummary() : runAnimated();
            }

            // Every batch: the clock moves through the hour while the cases move along their paths; then the case
            // positions are updated and the dots made to match them
            async function runAnimated() {
                const signal = abortController.signal;
                reconcileWithFrames();

                while (true) {
                    if (signal.aborted) return;
                    if (!batchesQueue.length && !(await waitForBatches(signal))) break;
                    if (signal.aborted) return;

                    currentBatch = batchesQueue.shift()!;
                    currentBatchUnfinished = true;
                    currentBatchIndex++;
                    emitQueueSample(batchesQueue.length);
                    topUpIfNeeded();

                    const batchDuration = toUtcMs(currentBatch.endDate) - toUtcMs(currentBatch.startDate);
                    const proportionalDelta = computeProportionalDelta(delta, batchDuration);
                    noteBatchEvents(currentBatch.events);

                    const eventsByCaseId = groupEventsByCaseId(currentBatch.events);
                    await Promise.allSettled([
                        animateTimeline(batchDuration),
                        ...Object.entries(eventsByCaseId).map(([caseId, batchEvents]) =>
                            handleBatchEvents({
                                caseId: parseInt(caseId),
                                batchEvents,
                                batchDuration: proportionalDelta,
                            })
                        ),
                    ]);
                    if (signal.aborted) return;

                    applyBatch(currentBatch);
                    currentBatchUnfinished = false;
                    reconcileWithFrames();
                    if (isResumed) isResumed = false;
                }

                finishPlayback();
            }

            // Fast playback: the clock runs continuously and every batch it passes is applied at once; the dots jump
            // to where the cases are instead of travelling
            function runSummary(): Promise<void> {
                const signal = abortController.signal;
                const initialMs = initialDate.getTime();
                const finalMs = finalDate.getTime();
                let simulatedMs = initialMs + currentProgress * totalDuration;
                let appliedUntil = simulatedMs;
                let last = performance.now();
                let waiting = false;

                localProgress = 0;
                isResumed = false;
                reconcileWithFrames();

                return new Promise(resolve => {
                    const step = (timestamp: number) => {
                        if (signal.aborted) {
                            // Resume from the end of the last applied batch, so no batch is applied twice
                            currentProgress = Math.min(Math.max((appliedUntil - initialMs) / totalDuration, 0), 1);
                            showProgress(currentProgress);
                            resolve();
                            return;
                        }

                        const elapsed = Math.max(0, timestamp - last);
                        last = timestamp;
                        let target = Math.min(simulatedMs + elapsed / delta * HOUR, finalMs);
                        // At the end of the simulation, the last (possibly partial) batches all count
                        const applyUntil = target >= finalMs ? Infinity : target;
                        let applied = false;

                        while (batchesQueue.length && toUtcMs(batchesQueue[0].endDate) <= applyUntil) {
                            currentBatch = batchesQueue.shift()!;
                            currentBatchIndex++;
                            noteBatchEvents(currentBatch.events);
                            applyBatch(currentBatch);
                            appliedUntil = toUtcMs(currentBatch.endDate);
                            applied = true;
                        }
                        if (applied) {
                            reconcileWithFrames();
                            emitQueueSample(batchesQueue.length);
                        }
                        topUpIfNeeded();

                        const moreToLoad = batchesPointer > 0;
                        if (!batchesQueue.length && moreToLoad) {
                            // Hold the clock until the next batches are loaded
                            target = Math.min(target, appliedUntil);
                            if (!waiting) {
                                waiting = true;
                                topBatchesQueueUp().finally(() => { waiting = false; });
                            }
                        }

                        simulatedMs = Math.max(simulatedMs, target);
                        currentProgress = totalDuration ? Math.min((simulatedMs - initialMs) / totalDuration, 1) : 1;
                        showProgress(currentProgress);

                        if (!batchesQueue.length && !moreToLoad && simulatedMs >= Math.min(finalMs, appliedUntil)) {
                            currentProgress = 1;
                            showProgress(1);
                            finishPlayback();
                            resolve();
                            return;
                        }
                        requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                });
            }

            // ---- Public ----

            this.setColorMode = (mode: ColorMode) => {
                colorMode = mode;
                paintAllTokens();
                if (agePaintInterval) clearInterval(agePaintInterval);
                agePaintInterval = mode === "age" ? setInterval(paintAllTokens, 1000) : null;
            };

            // Every case waiting for or being worked on in the task, longest waiting first
            this.getTaskQueue = (taskId: string): QueueEntry[] => {
                const entries: QueueEntry[] = [];
                rests.forEach(rest => {
                    if (rest.place.taskId !== taskId || (rest.place.kind !== "waiting" && rest.place.kind !== "working")) return;
                    entries.push({
                        caseId: rest.caseId,
                        state: rest.place.kind,
                        since: sinceOf(rest),
                        arrival: caseArrival(rest.caseId),
                    });
                });
                return entries.sort((a, b) =>
                    a.state === b.state ? (a.since ?? 0) - (b.since ?? 0) : a.state === "waiting" ? -1 : 1);
            };

            this.getCurrentTime = () => currentDateTime?.getTime() ?? null;

            this.start = () => {
                viewport = canvas.getContainer().querySelector('svg g[data-element-id]');
                tokenLayer = document.createElementNS(SVG_NS, "g");
                tokenLayer.classList.add("token-layer");
                badgeLayer = document.createElementNS(SVG_NS, "g");
                badgeLayer.classList.add("badge-layer");
                viewport.appendChild(tokenLayer);
                viewport.appendChild(badgeLayer);

                processId = simulationData.processId;
                initialDate = new Date(simulationData.startDate + 'Z');
                finalDate = new Date(simulationData.endDate + 'Z');
                utcOffset = simulationData.utcOffset ?? "+00:00";
                batchesQueue = simulationData.batches;
                frames = [...simulationData.frames];
                batchesPointer = simulationData.pointer;
                totalDuration = finalDate.getTime() - initialDate.getTime();
                showCurrentTime(0);
                enableTimeline();
                enableTokenHover();

                eventBus?.on("element.click", ({element}) => {
                    if (element && isTaskType(element.type)) hooks.onTaskClick?.(element.id);
                });
                eventBus?.on("diagram.destroy", () => {
                    abortController.abort();
                    if (agePaintInterval) clearInterval(agePaintInterval);
                    if (loadReportTimeout) clearTimeout(loadReportTimeout);
                });

                currentBatchIndex = 0;
                const totalBatches = Math.ceil(totalDuration / HOUR);
                queueMetricsSetter({
                    totalBatches,
                    totalDuration,
                    samples: [{ batchIndex: 0, queueLength: simulationData.batches.length }],
                });

                runSimulation();
            }
        };

    (tokenSimulation as typeof tokenSimulation & { $inject: string[] }).$inject = ['canvas', 'elementRegistry', 'eventBus'];

    return {
        __init__: ['tokenSimulation'],
        tokenSimulation: ['type', tokenSimulation],
    }
};


export default simulation;
