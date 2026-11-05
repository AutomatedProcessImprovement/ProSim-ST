import {Canvas, ElementRegistry, EventBus, Flow, Node, Waypoint} from "@definitions/simulation/interfaces";
import {
    AnimationData,
    Batch,
    BatchEvent,
    ColorMode,
    FrameCase,
    InitialView,
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
    clearPillSpot,
    DOT_RADIUS,
    heatOpacity,
    isTaskType,
    pillWidth,
    RestPlace,
    slotCapacity,
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
    hooks: SimulationHooks = {},
    initialView: InitialView = {},
) => {
    const tokenSimulation = function(canvas: Canvas, elementRegistry: ElementRegistry, eventBus?: EventBus) {
            let processId: string;
            const defaultDelta = msPerSimulatedHour(1);
            let delta = msPerSimulatedHour(initialView.hoursPerSecond ?? DEFAULT_HOURS_PER_SECOND);
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
            let currentBatchUnfinished = false;
            let frames: FrameCase[];
            let batchesPointer = 0;
            const playPauseButton = document.getElementById('play-pause-btn');
            let isPaused = false;
            let isResumed = false;
            let fetchPromise: Promise<void> | null = null;
            let queueGeneration = 0;
            let initialDate: Date;
            let finalDate: Date;
            let utcOffset = "+00:00";
            let abortController: AbortController = new AbortController();
            let hasEnded = false;
            let colorMode: ColorMode = initialView.colorMode ?? "state";
            let followedCase: number | null = null;
            let openingMoment = false;
            let agePaintInterval: ReturnType<typeof setInterval> | null = null;

            const rests = new Map<string, Rest>();
            const groups = new Map<string, Set<string>>();
            const animating = new Set<string>();
            const taskCounts = new Map<string, {waiting: number; inWork: number}>();
            const dirtyGroups = new Set<string>();
            const overflowing = new Map<string, RestPlace>();
            let layoutScheduled = false;
            const pills = new Map<string, {waiting: SVGGElement; inWork: SVGGElement}>();
            const otherPills = new Map<string, SVGGElement>();
            const shadedTasks = new Set<string>();
            const originalFills = new Map<string, string>();
            let lastLoadReport = 0;
            let loadReportTimeout: ReturnType<typeof setTimeout> | null = null;

            const taskTimes = new Map<number, Map<string, {enabled?: number; started?: number}>>();
            const seenArrivals = new Map<number, number>();
            const openAtStart = new Set(simulationData.frames.map(frame => frame.caseId));

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
                overflowing.delete(groupId);
                if (!members.length) groups.delete(groupId);
                if (!element || !members.length) return;

                members.sort((a, b) =>
                    Number(b.caseId === followedCase) - Number(a.caseId === followedCase) || (sinceOf(a) ?? 0) - (sinceOf(b) ?? 0));
                const capacity = slotCapacity(element);
                const fits = members.length <= capacity;
                const hideAll = !fits && members[0].place.kind === "working";
                const visible = Math.min(members.length, capacity);
                if (!fits) overflowing.set(groupId, members[0].place);
                members.forEach((rest, index) => {
                    const token = tokens[rest.caseId]?.[rest.tokenId];
                    if (!token) return;
                    setTokenPosition(token, slotPosition(element, Math.min(index, visible - 1), visible));
                    token.style.visibility = rest.caseId === followedCase || (!hideAll && index < capacity) ? "" : "hidden";
                });
            }

            function flushLayout() {
                layoutScheduled = false;
                dirtyGroups.forEach(layoutGroup);
                dirtyGroups.clear();
                renderLoad();
            }


            function createPill(elementId: string, className: string, clickable = true): SVGGElement {
                const group = document.createElementNS(SVG_NS, "g");
                group.classList.add("load-pill", className);
                group.setAttribute(clickable ? "data-task" : "data-element", elementId);
                group.appendChild(document.createElementNS(SVG_NS, "rect"));
                group.appendChild(document.createElementNS(SVG_NS, "text"));
                if (clickable) group.addEventListener("click", () => hooks.onTaskClick?.(elementId));
                badgeLayer.appendChild(group);
                return group;
            }

            function updatePill(pill: SVGGElement, label: string | null, {x: left, y}: Waypoint) {
                if (!label) {
                    pill.style.display = "none";
                    return;
                }
                const width = pillWidth(label);
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

            function connectedFlows(shape: Node) {
                return [...(shape.incoming ?? []), ...(shape.outgoing ?? [])].map(flow => flow.waypoints ?? []);
            }

            function spotBeside(shape: Node, label: string | null): Waypoint {
                return label ? clearPillSpot(shape, pillWidth(label), connectedFlows(shape)) : {x: 0, y: 0};
            }

            function renderLoad() {
                if (!badgeLayer) return;
                let maxWaiting = 0;
                taskCounts.forEach(({waiting}) => { maxWaiting = Math.max(maxWaiting, waiting); });

                const overflowingTasks = {waiting: new Set<string>(), working: new Set<string>()};
                overflowing.forEach(place => {
                    if (place.taskId && (place.kind === "waiting" || place.kind === "working")) overflowingTasks[place.kind].add(place.taskId);
                });

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

                    const showWaiting = overflowingTasks.waiting.has(taskId);
                    const showInWork = overflowingTasks.working.has(taskId);
                    let taskPills = pills.get(taskId);
                    if (!taskPills && (showWaiting || showInWork)) {
                        taskPills = {waiting: createPill(taskId, "waiting"), inWork: createPill(taskId, "in-work")};
                        pills.set(taskId, taskPills);
                    }
                    if (!taskPills) return;
                    const waitingLabel = showWaiting ? `${waiting} waiting` : null;
                    const inWorkLabel = showInWork ? `${inWork} in work` : null;
                    updatePill(taskPills.waiting, waitingLabel, spotBeside(shape, waitingLabel));
                    updatePill(taskPills.inWork, inWorkLabel, {
                        x: shape.x + shape.width / 2 - pillWidth(inWorkLabel ?? "") / 2,
                        y: shape.y + shape.height - 23,
                    });
                });

                renderOtherLoad();
                reportLoad();
            }

            function placeTarget(groupId: string): string | undefined {
                const element = getElement(groupId);
                return element?.type === FlowTypes.FLOW ? element.target?.id : groupId;
            }

            function renderOtherLoad() {
                const overflowingTargets = new Set<string>();
                overflowing.forEach((place, groupId) => {
                    if (place.kind !== "sync" && place.kind !== "other") return;
                    const target = placeTarget(groupId);
                    if (target) overflowingTargets.add(target);
                });

                const counts = new Map<string, number>();
                if (overflowingTargets.size) rests.forEach(rest => {
                    if (rest.place.kind !== "sync" && rest.place.kind !== "other") return;
                    const target = placeTarget(rest.place.groupId);
                    if (target && overflowingTargets.has(target)) counts.set(target, (counts.get(target) ?? 0) + 1);
                });

                new Set([...overflowingTargets, ...otherPills.keys()]).forEach(elementId => {
                    const shape = getElement(elementId) as Node | undefined;
                    if (!shape) return;
                    let pill = otherPills.get(elementId);
                    if (!pill) otherPills.set(elementId, pill = createPill(elementId, "other", false));
                    const count = counts.get(elementId);
                    const label = count ? `${count} waiting` : null;
                    updatePill(pill, label, spotBeside(shape, label));
                });
            }

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
                if (arrival !== null) lines.push(`Case open ${formatDuration(now() - arrival)}`);
                else if (openAtStart.has(caseId)) lines.push(`Open since before ${formatShortDate(initialDate, utcOffset, true)}`);
                return lines;
            }

            function describeTask(taskId: string): string[] {
                const {waiting = 0, inWork = 0} = taskCounts.get(taskId) ?? {};
                return [elementName(taskId), `${waiting} waiting · ${inWork} in work`];
            }

            function describeHovered(target: Element): string[] | null {
                if (target.classList?.contains("token")) {
                    const caseId = Number(target.getAttribute("data-case"));
                    const lines = describeToken(caseId, target.getAttribute("data-token"));
                    return caseId === followedCase ? lines : [...lines, "Click to follow this case"];
                }
                const taskId = target.closest?.(".djs-shape")?.getAttribute("data-element-id");
                return taskId && isTaskType(getElement(taskId)?.type) ? describeTask(taskId) : null;
            }

            function enableTokenHover() {
                const surface = canvas.getContainer();

                let pressedAt: {x: number; y: number} | null = null;
                tokenLayer.addEventListener("mousedown", event => { pressedAt = {x: event.clientX, y: event.clientY}; });
                tokenLayer.addEventListener("click", event => {
                    const target = event.target as Element;
                    const dragged = pressedAt && Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > 4;
                    if (dragged || !target.classList?.contains("token")) return;
                    hooks.onCaseClick?.(Number(target.getAttribute("data-case")));
                });

                if (!tokenTooltip) return;

                const show = (event: MouseEvent) => {
                    const lines = describeHovered(event.target as Element);
                    if (!lines) return;
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

                surface.addEventListener("mouseover", show);
                surface.addEventListener("mousemove", move);
                surface.addEventListener("mouseout", hide);
                surface.addEventListener("click", hide);
            }


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
                if (caseId === followedCase) token.classList.add("followed");
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
                overflowing.clear();
                renderLoad();
            }

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
                flushLayout();
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

                    let pending = 0;
                    const tracker: AnimationTracker = {
                        start: () => { pending++; },
                        done: () => { if (--pending === 0) resolve(); },
                    };

                    const animationData: AnimationData = {};
                    const finalElements: Record<string, string> = {};
                    const isAsyncAnimation = batchEvents.some(batchEvent => Object.keys(batchEvent.paths).length > 1)

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
                hooks.onViewChange?.();
            }

            function handlePlayPause() {
                if (openingMoment) return;

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
                    hooks.onViewChange?.();
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
                isPaused = false;
                isResumed = action.resetPatch.isResumed;
                abortController = new AbortController();
                restartFromFrames();
            }

            function restartFromFrames() {
                setTimeout(() => {
                    clearTokens();
                    runSimulation();
                }, 10);
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
                        isResumed = action.resetPatch.isResumed;
                        delta = calculatePlaybackDelta(defaultDelta, newSpeed);
                        abortController = new AbortController();
                        restartFromFrames();
                    }, 300);
                } else {
                    delta = calculatePlaybackDelta(defaultDelta, newSpeed);
                }
            }

            function openAtMoment(moment: number) {
                currentProgress = totalDuration ? Math.max(0, Math.min(1, (moment - initialDate.getTime()) / totalDuration)) : 0;
                isPaused = true;
                playPauseButton.innerHTML = " ▶";
                showProgress(currentProgress);
                openingMoment = true;
                handleTimelineRequest(currentProgress * 100, true).finally(() => { openingMoment = false; });
            }

            async function handleTimelineRequest(progress: number, stayPaused = false) {
                try {
                    const res = await axios.post(`/api/simulation/${processId}/resumption`, {
                        requestedDate: new Date(initialDate.getTime() + (progress / 100) * totalDuration).toISOString(),
                    });

                    const patch = buildTimelineResumptionPatch(res.data, isPaused && !stayPaused);

                    queueGeneration++;
                    tokenProgresses = patch.tokenProgresses;
                    localProgress = patch.localProgress;
                    batchesQueue = patch.batchesQueue;
                    currentBatchUnfinished = false;
                    frames = patch.frames;
                    batchesPointer = patch.batchesPointer;
                    seedTaskTimes(res.data.wtpt);

                    caseNumberSetter(patch.caseNumbers);

                    wtptSetter(prev => buildResumedWTPT(prev, res.data.wtpt));

                    if (patch.shouldUnpause) {
                        isPaused = false;
                        playPauseButton.innerHTML = "⏸";
                    }
                    hasEnded = stayPaused && progress >= 100;
                    abortController = new AbortController();
                    if (stayPaused) {
                        clearTokens();
                        reconcileWithFrames();
                    } else restartFromFrames();
                    hooks.onViewChange?.();
                } catch (error) {
                    console.log(error);
                    if (stayPaused) {
                        currentProgress = 0;
                        showProgress(0);
                        reconcileWithFrames();
                        hooks.onOpenFailed?.();
                    }
                }
            }


            function topBatchesQueueUp(): Promise<void> {
                if (fetchPromise) return fetchPromise;
                const generation = queueGeneration;

                fetchPromise = (async () => {
                    try {
                        const res = await axios.get(`/api/simulation/${processId}/polling?pointer=${batchesPointer}&limit=${batchFetchLimit(delta)}`);
                        if (generation !== queueGeneration) return;
                        batchesQueue.push(...res.data.batches);
                        batchesPointer = res.data.pointer;
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


            function runSimulation() {
                return isSummarySpeed(delta) ? runSummary() : runAnimated();
            }

            async function runAnimated() {
                const signal = abortController.signal;
                reconcileWithFrames();

                while (true) {
                    if (signal.aborted) return;
                    if (!batchesQueue.length && !(await waitForBatches(signal))) break;
                    if (signal.aborted) return;

                    currentBatch = batchesQueue.shift()!;
                    currentBatchUnfinished = true;
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
                            currentProgress = Math.min(Math.max((appliedUntil - initialMs) / totalDuration, 0), 1);
                            showProgress(currentProgress);
                            hooks.onViewChange?.();
                            resolve();
                            return;
                        }

                        const elapsed = Math.max(0, timestamp - last);
                        last = timestamp;
                        let target = Math.min(simulatedMs + elapsed / delta * HOUR, finalMs);
                        const applyUntil = target >= finalMs ? Infinity : target;
                        let applied = false;

                        while (batchesQueue.length && toUtcMs(batchesQueue[0].endDate) <= applyUntil) {
                            currentBatch = batchesQueue.shift()!;
                            noteBatchEvents(currentBatch.events);
                            applyBatch(currentBatch);
                            appliedUntil = toUtcMs(currentBatch.endDate);
                            applied = true;
                        }
                        if (applied) reconcileWithFrames();
                        topUpIfNeeded();

                        const moreToLoad = batchesPointer > 0;
                        if (!batchesQueue.length && moreToLoad) {
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


            this.setColorMode = (mode: ColorMode) => {
                colorMode = mode;
                paintAllTokens();
                if (agePaintInterval) clearInterval(agePaintInterval);
                agePaintInterval = mode === "age" ? setInterval(paintAllTokens, 1000) : null;
            };

            this.setFollowedCase = (caseId: number | null) => {
                const previous = followedCase;
                followedCase = caseId;
                [previous, caseId].forEach(id => {
                    if (id === null) return;
                    Object.values(tokens[id] ?? {}).forEach(token => {
                        token.classList.toggle("followed", id === followedCase);
                        if (token.isConnected) tokenLayer.appendChild(token);
                    });
                });
                rests.forEach(rest => {
                    if (rest.caseId === previous || rest.caseId === caseId) markDirty(rest.place.groupId);
                });
            };

            this.describeCase = (caseId: number): string[] => {
                const details = Object.keys(tokens[caseId] ?? {}).map(tokenId => describeToken(caseId, tokenId).slice(1));
                const places = new Set(details.map(lines => lines[0]));
                return [...places, ...details.slice(0, 1).flatMap(lines => lines.slice(1))];
            };

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
                if (colorMode === "age") this.setColorMode(colorMode);

                eventBus?.on("element.click", ({element}) => {
                    if (element && isTaskType(element.type)) hooks.onTaskClick?.(element.id);
                });
                eventBus?.on("diagram.destroy", () => {
                    abortController.abort();
                    if (agePaintInterval) clearInterval(agePaintInterval);
                    if (loadReportTimeout) clearTimeout(loadReportTimeout);
                });

                if (initialView.moment !== undefined) openAtMoment(initialView.moment);
                else runSimulation();
            }
        };

    (tokenSimulation as typeof tokenSimulation & { $inject: string[] }).$inject = ['canvas', 'elementRegistry', 'eventBus'];

    return {
        __init__: ['tokenSimulation'],
        tokenSimulation: ['type', tokenSimulation],
    }
};


export default simulation;
