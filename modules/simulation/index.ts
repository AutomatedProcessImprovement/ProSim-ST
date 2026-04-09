import {Canvas, ElementRegistry, Node, Waypoint} from "@definitions/simulation/interfaces";
import {getRandomColor} from "@utils/colors";
import {
    AnimationData,
    Batch,
    BatchEvent,
    FrameCase,
    PathMap,
    Token,
    TokenColors,
    TokenProgresses,
    Tokens, WTPTState
} from "@definitions/simulation/types";
import {FlowTypes, LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";
import axios from "axios";
import {SimulationData} from "@definitions/api/types";
import {formatDateString} from "@utils/dateHelpers";
import {Dispatch, SetStateAction} from "react";
import {buildPathMap, calculateDurations, calculatePathLength} from "@modules/simulation/pathDurationHelpers";
import {buildResumedWTPT, buildTimelineResumptionPatch} from "@modules/simulation/timelineResumptionHelpers";
import {
    calculatePlaybackDelta,
    decidePlaybackSpeedUpdateAction,
    decidePlayPauseResumeAction,
} from "@modules/simulation/playbackStateHelpers";
import {
    computeEmptyBatchWaitTime,
    computeProportionalDelta,
    computeTokenAnimationStartTime,
    groupEventsByCaseId,
    shouldTopUpQueue,
    shouldUpdateFrames,
} from "@modules/simulation/runSimulationHelpers";
import {applyBatchFrameUpdatesIfNeeded} from "@modules/simulation/frameUpdateHelpers";

const simulation = (
    simulationData: SimulationData,
    caseNumberSetter:  Dispatch<SetStateAction<{
        ongoing: number
        finished: number
    }>>,
    wtptSetter: Dispatch<SetStateAction<WTPTState>>
) => {
    const tokenSimulation = function(canvas: Canvas, elementRegistry: ElementRegistry) {
            let processId: string;
            let delta = 2000; // milliseconds
            const defaultDelta = 2000; // milliseconds
            let tokens: Tokens = {};
            const tokenColors: TokenColors = {};
            let coordinateMap: Record<string, Record<string, Array<Token>>> = {};
            let totalDuration: number;
            let viewport: HTMLDivElement;
            const timeline = document.getElementById('timeline');
            const progressBar = document.getElementById('progress-bar');
            const pointer = document.getElementById('pointer');
            const tooltip = document.getElementById('timeline-tooltip');
            const ctTimeBar = document.getElementById('cycle-time-chart-time-bar');
            let currentProgress: number = 0.0;
            const currentDateTimeBox = document.getElementById('simulated-time-box');
            let currentDateTime: Date;
            let localProgress: number = 0.0;
            let tokenProgresses: TokenProgresses = {};
            let batchesQueue: Batch[];
            let currentBatch: Batch;
            let frames: FrameCase[];
            let batchesPointer = 0;
            const maxBatchesLimit = 15;
            const playPauseButton = document.getElementById('play-pause-btn');
            let isPaused = false;
            let isResumed = false;
            let isFetchingBatches = false;
            let initialDate: Date;
            let finalDate: Date;
            let abortController: AbortController = new AbortController();
            let hasEnded = false;

            function getNodeTypeFromRegistry(elementId: string): string | undefined {
                return elementRegistry.get(elementId)?.type;
            }

            function placeToken(point: Waypoint, caseId: number, tokenId: string) {
                const { x, y } = point;
                const token = tokens[caseId][tokenId];
                updateCoordinateMap(point, caseId, tokenId);
                token.setAttribute("cx", x.toString());
                token.setAttribute("cy", y.toString());
            }

            function updateCoordinateMap(newPoint: Waypoint, caseId: number, tokenId: string) {
                const oldPoint = deleteCoordinates(caseId, tokenId);
                const newCoordinatesKey = `${newPoint.x}_${newPoint.y}`;
                if (!coordinateMap[newCoordinatesKey]) coordinateMap[newCoordinatesKey] = {};
                if (!coordinateMap[newCoordinatesKey][caseId]) coordinateMap[newCoordinatesKey][caseId] = [];
                coordinateMap[newCoordinatesKey][caseId].push(tokens[caseId][tokenId]);
                updateTokenSizes(newPoint);
                updateTokenSizes(oldPoint);
            }

            function deleteCoordinates(caseId: number, tokenId: string): Waypoint {
                const token = tokens[caseId][tokenId];
                const oldCoordinates = getTokenCoordinates(token);
                const oldCoordinatesKey = `${oldCoordinates.x}_${oldCoordinates.y}`;
                if (coordinateMap[oldCoordinatesKey]?.[caseId]) {
                    const index = coordinateMap[oldCoordinatesKey][caseId].indexOf(token);
                    if (index !== -1) {
                        coordinateMap[oldCoordinatesKey][caseId].splice(index, 1);
                        if (coordinateMap[oldCoordinatesKey][caseId].length === 0) {
                            delete coordinateMap[oldCoordinatesKey][caseId];
                        }
                        if (Object.keys(coordinateMap[oldCoordinatesKey]).length === 0) {
                            delete coordinateMap[oldCoordinatesKey];
                        }
                    }
                }

                return oldCoordinates;
            }

            function updateTokenSizes(point: Waypoint, threshold: number = 0.3) {
                let totalTokens = 0;
                const affectedCoordinateKeys: Array<string> = [];
                const affectedCases: Array<string> = [];

                Object.keys(coordinateMap).forEach((key) => {
                    const [coordinateX, coordinateY] = key.split('_').map(Number);
                    if (Math.abs(coordinateX - point.x) <= threshold && Math.abs(coordinateY - point.y) <= threshold) {
                        Object.keys(coordinateMap[key]).forEach(caseId => {
                           if (!affectedCases.includes(caseId)) {
                               totalTokens++;
                               affectedCases.push(caseId);
                           }
                        });
                        affectedCoordinateKeys.push(key);
                    }
                });

                const newSize = 10 + (totalTokens - 1) * 0.15;
                affectedCoordinateKeys.forEach((coordinatesKey) => {
                    Object.values(coordinateMap[coordinatesKey]).forEach((caseTokens) => {
                        caseTokens.forEach((token) => {
                            token.setAttribute("r", newSize.toString());
                        });
                    });
                });
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

            function createTokensForFrame(frameCase: FrameCase) {
                const color = getRandomColor();
                Object.entries(frameCase.activeElements).forEach(([tokenId, activeElementId]) => {
                    createToken(activeElementId, frameCase.caseId, tokenId, tokenColors[frameCase.caseId]?.[tokenId] ?? color);
                });
            }

            function createToken(activeElementId: string, caseId: number, tokenId: string, color: string, fadeIn: boolean = false, show: boolean = true): Token {
                if (!tokens[caseId]) tokens[caseId] = {};
                const token = document.createElementNS("http://www.w3.org/2000/svg", "circle"); // this should be installed locally
                token.setAttribute("r", "10");
                token.setAttribute("fill", color);
                token.classList.add("token");
                if (!tokenColors[caseId]) tokenColors[caseId] = {};
                tokenColors[caseId][tokenId] = color;
                const activeElement = elementRegistry.get(activeElementId);

                function processCreation(point: Waypoint) {
                    tokens[caseId][tokenId] = token;
                    placeToken(point, caseId, tokenId);
                    if (show) {
                        if (fadeIn) {
                            token.style.animationDuration = `2s`;
                            token.classList.add("fade-in");
                            token.addEventListener("animationend", () => {
                                token.classList.remove("fade-in");
                            });
                        }
                        viewport.appendChild(token);
                    }
                }

                if (activeElement?.type === FlowTypes.FLOW) {
                    const waypoints = activeElement.waypoints;
                    if (waypoints && waypoints.length) processCreation(waypoints[waypoints.length - 1]);
                } else processCreation(calculateCenterPoint(activeElement));

                return token;
            }

            function deleteToken(caseId: number, tokenId: string, fadeOut: boolean = false) {
                const token = tokens[caseId][tokenId];

                function processDeletion() {
                    deleteCoordinates(caseId, tokenId);
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    try { viewport.removeChild(token) } catch (e) {}
                    delete tokens[caseId][tokenId];
                }

                if (fadeOut) {
                    token.style.animationDuration = `2s`;
                    token.classList.add("fade-out");
                    token.addEventListener("animationend", processDeletion);
                } else processDeletion();
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
                        const element = elementRegistry.get(elementId);
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

                function fillAnimationDataOfToken(animationData: AnimationData, tokenId: string, path: Array<Waypoint>, nextTokenIds: Array<string>) {
                    if (!animationData[tokenId]) animationData[tokenId] = {path, nextTokenIds};
                    else {
                        animationData[tokenId] = {
                            path: [...animationData[tokenId].path, ...path],
                            nextTokenIds,
                        };
                    }
                }

                function fillOnCompleteEventOfToken(batchEvent: BatchEvent, animationData: AnimationData, tokenId: string, resolve: () => void) {
                    animationData[tokenId].onComplete = () => {
                        if (batchEvent.lifecycle === LifecycleTypes.CASE_END) deleteToken(caseId, tokenId, true);
                        resolve();
                    };
                }

                function buildAnimationDataOfToken(animationData: AnimationData, tokenId: string, elements: Array<string>, batchEventPathEntries: [string, Array<string>][], batchEvent: BatchEvent, resolve: () => void) {
                    const {
                        path,
                        nextTokenIds
                    } = addElementsToPath(animationData, tokenId, caseId, elements, batchEventPathEntries);
                    fillAnimationDataOfToken(animationData, tokenId, path, nextTokenIds);
                    fillOnCompleteEventOfToken(batchEvent, animationData, tokenId, resolve);
                }

                return new Promise((resolve: () => void, reject) => {
                    abortController.signal.addEventListener("abort", () => {
                        reject(new Error("Simulation aborted"));
                    });

                    const animationData: AnimationData = {};
                    const isAsyncAnimation = batchEvents.some(batchEvent => Object.keys(batchEvent.paths).length > 1)

                    batchEvents.forEach(batchEvent => {
                        const batchEventPathEntries = Object.entries(batchEvent.paths);
                        if (isAsyncAnimation) {
                            batchEventPathEntries.forEach(([tokenId, elements]) => {
                                const tokensOfCurrentCase = tokens[caseId];
                                if (!tokensOfCurrentCase?.[tokenId]) {
                                    const tokenColor = tokenColors[caseId]?.[tokenId];

                                    let color: string;
                                    let show: boolean;

                                    if (tokenColor) {
                                        color = tokenColor;
                                        show = !tokensOfCurrentCase;
                                    } else if (tokensOfCurrentCase) {
                                        color = Object.values(tokensOfCurrentCase)[0].getAttribute("fill");
                                        show = false;
                                    } else {
                                        color = getRandomColor();
                                        show = true;
                                    }

                                    createToken(elements[0], caseId, tokenId, color, show && (!isResumed || !tokenProgresses[caseId]?.[tokenId]), show);
                                }
                                buildAnimationDataOfToken(animationData, tokenId, elements, batchEventPathEntries, batchEvent, resolve);
                            });
                        } else if (batchEventPathEntries.length) {
                            const [tokenId, elements] = batchEventPathEntries[0];
                            if (!tokens[caseId]) createToken(elements[0], caseId, tokenId, tokenColors[caseId]?.[tokenId] ?? getRandomColor(), !isResumed || !tokenProgresses[caseId]?.[tokenId]);
                            buildAnimationDataOfToken(animationData, tokenId, elements, batchEventPathEntries, batchEvent, resolve);
                        }
                    });

                    if (isAsyncAnimation) animateAsyncData(buildPathMap(animationData), caseId, batchDuration, false, new Set());
                    else {
                        if (Object.keys(animationData).length === 0) setTimeout(resolve, batchDuration * (1 - (isResumed ? localProgress : 0)));
                        else Object.entries(animationData).forEach(animationEntry => {
                            const [tokenId, {path, onComplete}] = animationEntry;
                            animateToken(path, onComplete, caseId, tokenId, batchDuration);
                        });
                    }
                });
            }


            function animateAsyncData(pathMap: PathMap, caseId: number, remainingDuration: number, isHidden: boolean, animatedTokens: Set<string>) {
                const durations = calculateDurations(pathMap, animatedTokens, remainingDuration);

                Object.entries(pathMap).forEach(([tokenId, tokenData]) => {
                    if (animatedTokens.has(tokenId)) return;

                    const token = tokens[caseId][tokenId];
                    if (isHidden) viewport.appendChild(token);
                    const duration = durations[tokenId];
                    const onComplete = () => {
                        if (Object.keys(tokenData.subPaths).length) {
                            deleteToken(caseId, tokenId);
                            animateAsyncData(tokenData.subPaths, caseId, remainingDuration - duration, true, animatedTokens);
                        } else {
                            tokenData.onComplete();
                        }
                    }
                    animatedTokens.add(tokenId);
                    animateToken(tokenData.path, onComplete, caseId, tokenId, duration);
                });
            }

            function animateToken(path: Waypoint[], onComplete: () => void, caseId: number, tokenId: string, duration: number) {
                const startTime = computeTokenAnimationStartTime(
                    performance.now(),
                    duration,
                    isResumed,
                    tokenProgresses[caseId]?.[tokenId],
                );
                const pathLength = calculatePathLength(path);

                function animate() {
                    if (abortController.signal.aborted) return;

                    const elapsedTime = performance.now() - startTime;
                    const progress = Math.min(elapsedTime / duration, 1);
                    const currentDistance = progress * pathLength;

                    let accumulatedDistance = 0;
                    for (let i = 0; i < path.length - 1; i++) {
                        const segmentStart = path[i];
                        const segmentEnd = path[i + 1];
                        const dx = segmentEnd.x - segmentStart.x;
                        const dy = segmentEnd.y - segmentStart.y;
                        const segmentLength = Math.sqrt(dx * dx + dy * dy);

                        if (accumulatedDistance + segmentLength >= currentDistance) {
                            const segmentProgress = (currentDistance - accumulatedDistance) / segmentLength;
                            const x = segmentStart.x + dx * segmentProgress;
                            const y = segmentStart.y + dy * segmentProgress;
                            placeToken({ x, y }, caseId, tokenId);
                            break;
                        }

                        accumulatedDistance += segmentLength;
                    }

                    if (!tokenProgresses[caseId]) tokenProgresses[caseId] = {};
                    tokenProgresses[caseId][tokenId] = progress;

                    if (progress < 1) requestAnimationFrame(animate);
                    else onComplete();
                }

                requestAnimationFrame(animate);
            }

            function enableTimeline() {
                const startDate = document.getElementById("start-date");
                startDate.textContent = formatDateString(initialDate);
                const endDate = document.getElementById("end-date");
                endDate.textContent = formatDateString(finalDate);

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

            async function animateTimeline(batchDuration: number) {
                let startTime = performance.now();
                if (isResumed && localProgress) {
                    const proportionalDelta = delta * batchDuration / 3600000;
                    startTime -= localProgress * proportionalDelta;
                }

                function animate() {
                    if (abortController.signal.aborted) return;

                    const elapsedTime = Math.min((performance.now() - startTime) / delta * 3600000, batchDuration); // 1hr = 3600000ms
                    const progress = Math.min(currentProgress + elapsedTime / totalDuration, 1);
                    const innerProgress = elapsedTime / batchDuration;

                    const progressPercentage = `${progress * 100}%`;
                    progressBar.style.width = progressPercentage
                    pointer.style.left = progressPercentage;
                    ctTimeBar.style.width = `calc((100% - 24px) * ${progress})`;

                    const totalElapsedTime = progress * totalDuration;
                    currentDateTime = new Date(initialDate.getTime() + totalElapsedTime);
                    currentDateTimeBox.textContent = formatDateString(currentDateTime);

                    if (innerProgress < 1) {
                        localProgress = innerProgress;
                        requestAnimationFrame(animate);
                    } else {
                        currentProgress = progress;
                        localProgress = 0.0;
                    }
                }

                requestAnimationFrame(animate);
            }

            function enableTimelineDragging() {
                let isDragging = false;

                function updateProgress(event: MouseEvent | TouchEvent) {
                    if (!isDragging) return;

                    const rect = timeline.getBoundingClientRect();
                    const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
                    const progress = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));

                    progressBar.style.width = `${progress}%`;
                    pointer.style.left = `${progress}%`;
                    ctTimeBar.style.width = `calc((100% - 24px) * ${progress / 100})`;
                    currentProgress = progress / 100;
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

                    tooltip.textContent = formatDateString(new Date(initialDate.getTime() + (progress / 100) * totalDuration));
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

                progressBar.style.width = `${progress}%`;
                pointer.style.left = `${progress}%`;
                ctTimeBar.style.width = `calc((100% - 24px) * ${progress / 100})`;
                currentProgress = progress / 100;

                handleTimelineRequest(progress);
            }

            function handlePlayPause() {
                const action = decidePlayPauseResumeAction({
                    isPaused,
                    hasEnded,
                    batchesQueue,
                    currentBatch,
                    localProgress,
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
                    handleTimelineRequest(0);
                    return;
                }

                batchesQueue = action.nextQueue;
                playPauseButton.innerHTML = "⏸";
                document.querySelectorAll(".token").forEach(token => token.remove());
                tokens = action.resetPatch.tokens;
                coordinateMap = action.resetPatch.coordinateMap;
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
                });

                if (action.kind === "running") {
                    abortController.abort();

                    setTimeout(() => {
                        batchesQueue = action.nextQueue;
                        document.querySelectorAll(".token").forEach(token => token.remove());
                        tokens = action.resetPatch.tokens;
                        coordinateMap = action.resetPatch.coordinateMap;
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

                    document.querySelectorAll(".token").forEach(token => token.remove());
                    tokens = {};
                    coordinateMap = {};
                    tokenProgresses = patch.tokenProgresses;
                    localProgress = patch.localProgress;
                    batchesQueue = patch.batchesQueue;
                    frames = patch.frames;
                    batchesPointer = patch.batchesPointer;

                    caseNumberSetter(patch.caseNumbers);

                    wtptSetter(prev => buildResumedWTPT(prev, res.data.wtpt));

                    if (patch.shouldUnpause) {
                        isPaused = false;
                        playPauseButton.innerHTML = "⏸";
                    }
                    abortController = new AbortController();
                    setTimeout(runSimulation, 10);
                } catch (error) {
                    console.log(error);
                }
            }

            async function topBatchesQueueUp(limit: number) {
                if (isFetchingBatches) return;
                isFetchingBatches = true;

                try {
                    const res = await axios.get(`/api/simulation/${processId}/polling?pointer=${batchesPointer}&limit=${limit}`);
                    batchesQueue.push(...res.data.batches);
                    batchesPointer = res.data.pointer;
                } catch (error) {
                    console.log(error);
                } finally {
                    isFetchingBatches = false;
                }
            }

            async function runSimulation() {
                frames.forEach(frameCase => {
                    createTokensForFrame(frameCase);
                });

                while (batchesQueue.length > 0) {
                    if (abortController.signal.aborted) return;

                    currentBatch = batchesQueue.shift()!;

                    const batchesQueueLength = batchesQueue.length;
                    if (shouldTopUpQueue(batchesQueueLength, batchesPointer)) {
                        topBatchesQueueUp(maxBatchesLimit - batchesQueueLength);
                    }

                    const batchDuration = new Date(currentBatch.endDate).getTime() - new Date(currentBatch.startDate).getTime();
                    const proportionalDelta = computeProportionalDelta(delta, batchDuration);

                    if (currentBatch.events.length === 0) {
                        try {
                            await Promise.all([
                                animateTimeline(batchDuration),
                                new Promise((resolve, reject) => {
                                    const timeout = setTimeout(resolve, computeEmptyBatchWaitTime(proportionalDelta, isResumed, localProgress));
                                    abortController.signal.addEventListener("abort", () => {
                                        clearTimeout(timeout);
                                        reject(new Error("Simulation aborted"));
                                    });
                                })
                            ]);
                        } catch (error) {
                            if (abortController.signal.aborted && error.message === "Simulation aborted") {
                                return;
                            }
                        }
                    } else {
                        const eventsByCaseId = groupEventsByCaseId(currentBatch.events);
                        try {
                            await Promise.all(
                                [
                                    animateTimeline(batchDuration),
                                    ...Object.entries(eventsByCaseId).map(([caseId, batchEvents]) =>
                                        handleBatchEvents({
                                            caseId: parseInt(caseId),
                                            batchEvents,
                                            batchDuration: proportionalDelta,
                                        })
                                    ),
                                ]
                            );
                        } catch (error) {
                            if (abortController.signal.aborted && error.message === "Simulation aborted") {
                                return;
                            }
                        } finally {
                            frames = applyBatchFrameUpdatesIfNeeded({
                                shouldApply: shouldUpdateFrames(localProgress, currentBatch.endDate, currentDateTime),
                                frames,
                                batch: currentBatch,
                                getNodeType: getNodeTypeFromRegistry,
                                caseNumberSetter,
                                wtptSetter,
                            });
                        }
                    }

                    if (isResumed) isResumed = false;
                }

                playPauseButton.innerHTML = " ▶";
                isPaused = true;
                hasEnded = true;
            }

            this.start = () => {
                viewport = canvas.getContainer().querySelector('svg g[data-element-id]');
                processId = simulationData.processId;
                initialDate = new Date(simulationData.startDate + 'Z');
                finalDate = new Date(simulationData.endDate + 'Z');
                batchesQueue = simulationData.batches;
                frames = [...simulationData.frames];
                batchesPointer = simulationData.pointer;
                totalDuration = finalDate.getTime() - initialDate.getTime();
                enableTimeline();

                runSimulation();
            }
        };

    (tokenSimulation as typeof tokenSimulation & { $inject: string[] }).$inject = ['canvas', 'elementRegistry'];

    return {
        __init__: ['tokenSimulation'],
        tokenSimulation: ['type', tokenSimulation],
    }
};


export default simulation;
