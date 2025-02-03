import {Canvas, ElementRegistry, Node, Waypoint} from "@definitions/simulation/interfaces";
import {getRandomColor} from "@utils/colors";
import {
    AnimationData,
    Batch,
    BatchEvent,
    EventsByCaseId,
    FrameCase,
    PathMap,
    SimulationData,
    Token,
    TokenColors,
    Tokens
} from "@definitions/simulation/types";
import {FlowTypes, LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";
import axios from "@node_modules/axios";

const simulateToken = (simulationData: SimulationData, id: string) => {
    return {
        __init__: ['tokenSimulation'],
        tokenSimulation: ['type', function(canvas: Canvas, elementRegistry: ElementRegistry) {
            const delta = 2000; // milliseconds
            let tokens: Tokens = {};
            const tokenColors: TokenColors = {};
            let coordinateMap: Record<string, Record<string, Array<Token>>> = {};
            let totalDuration: number;
            let viewport: HTMLDivElement;
            let timeline: HTMLDivElement;
            let progressBar: HTMLDivElement;
            let pointer: HTMLDivElement;
            let tooltip: HTMLDivElement;
            let batches: Batch[];
            let initialBatches: Batch[];
            let abortController: AbortController = new AbortController();

            function placeToken(point: Waypoint, caseId: string, tokenId: string) {
                let { x, y } = point;
                const token = tokens[caseId][tokenId];
                updateCoordinateMap(point, caseId, tokenId);
                token.setAttribute("cx", x.toString());
                token.setAttribute("cy", y.toString());
            }

            function updateCoordinateMap(newPoint: Waypoint, caseId: string, tokenId: string) {
                const oldPoint = deleteCoordinates(caseId, tokenId);
                const newCoordinatesKey = `${newPoint.x}_${newPoint.y}`;
                if (!coordinateMap[newCoordinatesKey]) coordinateMap[newCoordinatesKey] = {};
                if (!coordinateMap[newCoordinatesKey][caseId]) coordinateMap[newCoordinatesKey][caseId] = [];
                coordinateMap[newCoordinatesKey][caseId].push(tokens[caseId][tokenId]);
                updateTokenSizes(newPoint);
                updateTokenSizes(oldPoint);
            }

            function deleteCoordinates(caseId: string, tokenId: string): Waypoint {
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

                const newSize = 10 + (totalTokens - 1) * 5;
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
                Object.entries(frameCase.active_elements).forEach(([tokenId, activeElementId]) => {
                    createToken(activeElementId, frameCase.case_id, tokenId, tokenColors[frameCase.case_id]?.[tokenId] ?? color);
                });
            }

            function createToken(activeElementId: string, caseId: string, tokenId: string, color: string, fadeIn: boolean = false, show: boolean = true): Token {
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
                            token.style.animationDuration = `${delta / 1000}s`;
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

            function deleteToken(caseId: string, tokenId: string, fadeOut: boolean = false) {
                const token = tokens[caseId][tokenId];

                function processDeletion() {
                    deleteCoordinates(caseId, tokenId);
                    viewport.removeChild(token);
                    delete tokens[caseId][tokenId];
                }

                if (fadeOut) {
                    token.style.animationDuration = `${delta / 1000}s`;
                    token.classList.add("fade-out");
                    token.addEventListener("animationend", processDeletion);
                } else processDeletion();
            }

            function calculatePathLength(path: Waypoint[]): number {
                let pathLength = 0;
                for (let i = 0; i < path.length - 1; i++) {
                    const dx = path[i + 1].x - path[i].x;
                    const dy = path[i + 1].y - path[i].y;
                    pathLength += Math.sqrt(dx * dx + dy * dy);
                }
                return pathLength;
            }

            function handleBatchEvents({caseId, batchEvents, batchDuration}: { caseId: string; batchEvents: Array<BatchEvent>; batchDuration: number }): Promise<void> {
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
                    caseId: string,
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
                                    .map(([otherTokenId, _]) => otherTokenId);
                            }
                        }
                    });

                    return { path, nextTokenIds };
                }

                function fillAnimationDataOfToken(animationData: AnimationData, tokenId: string, path: Array<Waypoint>, nextTokenIds: Array<string> = []) {
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
                        reject("Simulation aborted");
                    });

                    let animationData: AnimationData = {};
                    let isAsyncAnimation = batchEvents.some(batchEvent => Object.keys(batchEvent.paths).length > 1)

                    batchEvents.forEach(batchEvent => {
                        const batchEventPathEntries = Object.entries(batchEvent.paths);
                        if (isAsyncAnimation) {
                            batchEventPathEntries.forEach(([tokenId, elements]) => {
                                const tokensOfCurrentCase = tokens[caseId];
                                if (!tokensOfCurrentCase?.[tokenId]) {
                                    const [color, fadeIn]: [string, boolean] = tokenColors[caseId]?.[tokenId] ??
                                        tokensOfCurrentCase ?
                                        [Object.values(tokensOfCurrentCase)[0].getAttribute("fill"), false] :
                                        [getRandomColor(), true];
                                    createToken(elements[0], caseId, tokenId, color, fadeIn, fadeIn);
                                }
                                buildAnimationDataOfToken(animationData, tokenId, elements, batchEventPathEntries, batchEvent, resolve);
                            });
                        } else if (batchEventPathEntries.length) {
                            const [tokenId, elements] = batchEventPathEntries[0];
                            if (!tokens[caseId]) createToken(elements[0], caseId, tokenId, tokenColors[caseId]?.[tokenId] ?? getRandomColor(), true);
                            buildAnimationDataOfToken(animationData, tokenId, elements, batchEventPathEntries, batchEvent, resolve);
                        }
                    });

                    if (isAsyncAnimation) animateAsyncData(buildPathMap(animationData), caseId, batchDuration);
                    else {
                        if (Object.keys(animationData).length === 0) setTimeout(resolve, batchDuration);
                        else Object.entries(animationData).forEach(animationEntry => {
                            const [tokenId, {path, onComplete}] = animationEntry;
                            animateToken(path, onComplete, caseId, tokenId, batchDuration);
                        });
                    }
                });
            }

            function buildPathMap(asyncAnimationData: AnimationData): PathMap {
                const pathMap: PathMap = {};

                function buildPathMapRec(tokenId: string, currentPathMap: PathMap, currentPath: Waypoint[] = []): number {
                    const tokenData = asyncAnimationData[tokenId];
                    const currentTokenPath = tokenData.path
                    const currentTokenPathLength = calculatePathLength(currentTokenPath);
                    currentPathMap[tokenId] = { path: currentTokenPath, subPaths: {}, onComplete: tokenData.onComplete };
                    let longestSubPath = 0;

                    if (!(tokenData.nextTokenIds && tokenData.nextTokenIds.length)) {
                        currentPathMap[tokenId].longestSubPathLength = currentTokenPathLength;
                    } else {
                        const nextTokenIds = tokenData.nextTokenIds || [];
                        nextTokenIds.forEach(nextTokenId => {
                            const subPathLength = buildPathMapRec(nextTokenId, currentPathMap[tokenId].subPaths, [...currentPath, ...currentTokenPath]);
                            longestSubPath = Math.max(longestSubPath, subPathLength);
                        });
                        currentPathMap[tokenId].longestSubPathLength = currentTokenPathLength + longestSubPath;
                    }

                    return currentTokenPathLength + longestSubPath;
                }

                const tokenIds = Object.keys(asyncAnimationData).filter(tokenId =>
                    !Object.values(asyncAnimationData).some(data => data.nextTokenIds?.includes(tokenId))
                );

                tokenIds.forEach(tokenId => { buildPathMapRec(tokenId, pathMap); });

                return pathMap;
            }

            function calculateDurations(pathMap: PathMap, animatedTokens: Set<string>, overallDuration: number) {
                const durations: Record<string, number> = {};
                const mergingTokenIds = new Array<string>();

                Object.entries(pathMap).forEach(([tokenId, tokenData]) => {
                    if (animatedTokens.has(tokenId)) return;

                    if (Object.keys(tokenData.subPaths).length === 1) mergingTokenIds.push(tokenId);
                    else durations[tokenId] = calculatePathLength(tokenData.path) * overallDuration / tokenData.longestSubPathLength;
                });

                if (mergingTokenIds.length) {
                    const tokenIdWithLongestPath = mergingTokenIds.reduce((longestPathTokenId, tokenId) =>
                        pathMap[tokenId].longestSubPathLength > pathMap[longestPathTokenId].longestSubPathLength ? tokenId : longestPathTokenId
                    );
                    const longestPath = pathMap[tokenIdWithLongestPath].longestSubPathLength;
                    const tokenWithLongestPathSegmentLength = calculatePathLength(pathMap[tokenIdWithLongestPath].path);
                    const tokenWithLongestPathDuration = overallDuration * tokenWithLongestPathSegmentLength / longestPath;
                    const tokenWithLongestPathRemainingPathLength = longestPath - tokenWithLongestPathSegmentLength;
                    const tokenWithLongestPathRemainingDuration = overallDuration - tokenWithLongestPathDuration;

                    mergingTokenIds.forEach(tokenId => {
                        const segmentLength = calculatePathLength(pathMap[tokenId].path);
                        const remainingPathLength = pathMap[tokenId].longestSubPathLength - segmentLength;
                        const currentRemainingDuration = remainingPathLength * tokenWithLongestPathRemainingDuration / tokenWithLongestPathRemainingPathLength;
                        durations[tokenId] = overallDuration - currentRemainingDuration;
                    });
                }

                return durations;
            }

            function animateAsyncData(pathMap: PathMap, caseId: string, overallDuration: number = delta, isHidden: boolean = false, animatedTokens: Set<string> = new Set()) {
                const durations = calculateDurations(pathMap, animatedTokens, overallDuration);

                Object.entries(pathMap).forEach(([tokenId, tokenData]) => {
                    if (animatedTokens.has(tokenId)) return;

                    const token = tokens[caseId][tokenId];
                    if (isHidden) viewport.appendChild(token);
                    const duration = durations[tokenId];
                    const onComplete = () => {
                        if (Object.keys(tokenData.subPaths).length) {
                            deleteToken(caseId, tokenId);
                            animateAsyncData(tokenData.subPaths, caseId, overallDuration - duration, true, animatedTokens);
                        } else {
                            tokenData.onComplete();
                        }
                    }
                    animatedTokens.add(tokenId);
                    animateToken(tokenData.path, onComplete, caseId, tokenId, duration);
                });
            }

            function animateToken(path: Waypoint[], onComplete: () => void, caseId: string, tokenId: string, duration: number = delta) {
                const startTime = performance.now();
                let pathLength = calculatePathLength(path);

                function animate(time: number) {
                    if (abortController.signal.aborted) return;

                    const elapsedTime = time - startTime;
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

                    if (progress < 1) requestAnimationFrame(animate);
                    else onComplete();
                }

                requestAnimationFrame(animate);
            }

            function createTimeline(container: HTMLElement) {
                timeline = document.createElement("div");
                timeline.classList.add("timeline");

                progressBar = document.createElement("div");
                progressBar.classList.add("progress-bar");

                pointer = document.createElement("div");
                pointer.classList.add("pointer");

                const startDate = document.createElement("small");
                startDate.textContent = new Date(initialBatches[0].start_date).toLocaleString();
                startDate.classList.add("start-date");

                const endDate = document.createElement("small");
                endDate.textContent = new Date(initialBatches[initialBatches.length - 1].end_date).toLocaleString();
                endDate.classList.add("end-date");

                tooltip = document.createElement("div");
                tooltip.classList.add("timeline-tooltip");

                timeline.appendChild(progressBar);
                timeline.appendChild(pointer);
                timeline.appendChild(startDate)
                timeline.appendChild(endDate)
                container.appendChild(timeline);
                document.body.appendChild(tooltip);

                enableTimelineDragging();
                enableTimelineHover();
            }

            function animateTimeline(batchDuration: number) {
                const startTime = performance.now();
                const currentProgress = (parseFloat(progressBar.style.width) || 0) / 100;

                function animate() {
                    if (abortController.signal.aborted) return;

                    const elapsedTime = (performance.now() - startTime) / 2 * 3600; // delta = 2s, 1hr = 3600s
                    const progress = Math.min(currentProgress + elapsedTime / totalDuration, 1) * 100;
                    const localProgress = Math.min(elapsedTime / batchDuration, 1);

                    progressBar.style.width = `${progress}%`;
                    pointer.style.left = `${progress}%`;

                    if (localProgress < 1) requestAnimationFrame(animate);
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

                    const hoveredTimestamp = new Date(initialBatches[0].start_date).getTime() + (progress / 100) * totalDuration;
                    tooltip.textContent = new Date(hoveredTimestamp).toLocaleString();
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

            async function runSimulation() {
                batches = simulationData.deltas_mockup;
                simulationData.frame_mockup.forEach(frameCase => {
                    createTokensForFrame(frameCase);
                });

                for (const batch of batches) {
                    if (abortController.signal.aborted) return;

                    const batchDuration = new Date(batch.end_date).getTime() - new Date(batch.start_date).getTime();
                    const proportionalDelta = delta * batchDuration / 3600000; // 1hr = 3600000ms

                    if (batch.events.length === 0) {
                        animateTimeline(batchDuration);
                        await new Promise((resolve, reject) => {
                            const timeout = setTimeout(resolve, proportionalDelta);
                            abortController.signal.addEventListener("abort", () => {
                                clearTimeout(timeout);
                                reject("Simulation aborted");
                            });
                        });
                    } else {
                        const eventsByCaseId: EventsByCaseId = {};
                        batch.events.forEach((event) => {
                            if (!eventsByCaseId[event.case_id]) eventsByCaseId[event.case_id] = [];
                            eventsByCaseId[event.case_id].push(event);
                        });

                        animateTimeline(batchDuration);
                        try {
                            await Promise.all(
                                Object.entries(eventsByCaseId).map(([caseId, batchEvents]) =>
                                    handleBatchEvents({ caseId, batchEvents, batchDuration: proportionalDelta })
                                )
                            );
                        } catch (error) {
                            if (abortController.signal.aborted) return;
                        }
                    }
                }
            }

            async function handleTimelineRequest(progress: number) {
                const clickTimestamp = new Date(initialBatches[0].start_date).getTime() + (progress / 100) * totalDuration;

                try {
                    const res = await axios.get(`/api/simulation/${id}`);

                    abortController.abort();
                    Object.values(tokens).forEach(tokensByCaseId => {
                        Object.values(tokensByCaseId).forEach(token => {
                            try { viewport.removeChild(token); } catch (e) {}
                        });
                    });
                    tokens = {};
                    coordinateMap = {};
                    simulationData = res.data.simulationData;
                    batches = [];
                    progressBar.style.width = `${progress}%`;
                    pointer.style.left = `${progress}%`;

                    setTimeout(() => {
                        abortController = new AbortController();
                        runSimulation();
                    }, 10);
                } catch (error) {
                    console.log(error);
                }
            }

            this.start = async () => {
                viewport = canvas.getContainer().querySelector('svg g[data-element-id]');
                initialBatches = simulationData.deltas_mockup;
                totalDuration = new Date(initialBatches[initialBatches.length - 1].end_date).getTime() - new Date(initialBatches[0].start_date).getTime();
                createTimeline(document.body);
                timeline.addEventListener("click", (event) => {
                    const timelineRect = timeline.getBoundingClientRect();
                    const clickX = event.clientX - timelineRect.left;
                    const progress = (clickX / timelineRect.width) * 100;
                    handleTimelineRequest(progress);
                });

                await runSimulation();
            }
        }],
    }
};

export default simulateToken;
