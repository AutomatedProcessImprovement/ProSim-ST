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
    Tokens
} from "@definitions/simulation/types";
import { FlowTypes, LifecycleTypes, NodeTypes } from "@definitions/simulation/enums";

const simulateToken = (simulationData: SimulationData) => {
    return {
        __init__: ['tokenSimulation'],
        tokenSimulation: ['type', function(canvas: Canvas, elementRegistry: ElementRegistry) {
            const delta = 2000; // milliseconds
            const tokens: Tokens = {};
            let viewport: HTMLDivElement;
            let batches: Batch[];

            function placeToken(token: Token, x: string, y: string) {
                token.setAttribute("cx", x);
                token.setAttribute("cy", y);
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
                    createToken(activeElementId, frameCase.case_id, tokenId, color);
                });
            }

            function createToken(activeElementId: string, caseId: string, tokenId: string, color: string, show: boolean = true): Token {
                if (!tokens[caseId]) tokens[caseId] = {};

                const token = document.createElementNS("http://www.w3.org/2000/svg", "circle"); // this should be installed locally
                token.setAttribute("r", "10");
                token.setAttribute("fill", color);
                token.classList.add("token");
                const activeElement = elementRegistry.get(activeElementId);

                function addTokenToList(token: Token, point: Waypoint, show: boolean) {
                    placeToken(token, point.x.toString(), point.y.toString());
                    if (show) viewport.appendChild(token);
                    tokens[caseId][tokenId] = token;
                }

                if (activeElement?.type === FlowTypes.FLOW) {
                    const waypoints = activeElement.waypoints;
                    if (waypoints && waypoints.length) addTokenToList(token, waypoints[waypoints.length - 1], show);
                } else {
                    addTokenToList(token, calculateCenterPoint(activeElement), show)
                }

                return token;
            }

            function deleteToken(caseId: string, tokenId: string) {
                viewport.removeChild(tokens[caseId][tokenId]);
                delete tokens[caseId][tokenId];
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

            function handleBatchEvents({caseId, batchEvents}: { caseId: string; batchEvents: Array<BatchEvent>; }): Promise<void> {
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
                    if (batchEvent.lifecycle === LifecycleTypes.CASE_END) {
                        animationData[tokenId].onComplete = () => {
                            resolve();
                            setTimeout(() => deleteToken(caseId, tokenId), delta);
                        };
                    } else {
                        animationData[tokenId].onComplete = resolve;
                    }
                }

                function buildAnimationDataOfToken(animationData: AnimationData, tokenId: string, elements: Array<string>, batchEventPathEntries: [string, Array<string>][], batchEvent: BatchEvent, resolve: () => void) {
                    const {
                        path,
                        nextTokenIds
                    } = addElementsToPath(animationData, tokenId, caseId, elements, batchEventPathEntries);
                    fillAnimationDataOfToken(animationData, tokenId, path, nextTokenIds);
                    fillOnCompleteEventOfToken(batchEvent, animationData, tokenId, resolve);
                }

                return new Promise((resolve: () => void) => {
                    let animationData: AnimationData = {};
                    let isAsyncAnimation = batchEvents.some(batchEvent => Object.keys(batchEvent.paths).length > 1)

                    batchEvents.forEach(batchEvent => {
                        const batchEventPathEntries = Object.entries(batchEvent.paths);
                        if (isAsyncAnimation) {
                            batchEventPathEntries.forEach(([tokenId, elements]) => {
                                const tokensOfCurrentCase = tokens[caseId];
                                if (!tokensOfCurrentCase?.[tokenId]) {
                                    const [color, show]: [string, boolean] = tokensOfCurrentCase
                                        ? [Object.values(tokensOfCurrentCase)[0].getAttribute("fill"), false]
                                        : [getRandomColor(), true];
                                    createToken(elements[0], caseId, tokenId, color, show);
                                }
                                buildAnimationDataOfToken(animationData, tokenId, elements, batchEventPathEntries, batchEvent, resolve);
                            });
                        } else if (batchEventPathEntries.length) {
                            const [tokenId, elements] = batchEventPathEntries[0];
                            if (!tokens[caseId]) createToken(elements[0], caseId, tokenId, getRandomColor());
                            buildAnimationDataOfToken(animationData, tokenId, elements, batchEventPathEntries, batchEvent, resolve);
                        }
                    });

                    if (isAsyncAnimation) animateAsyncData(buildPathMap(animationData), caseId);
                    else {
                        if (Object.keys(animationData).length === 0) setTimeout(resolve, delta);
                        else Object.entries(animationData).forEach(animationEntry => {
                            const [tokenId, {path, onComplete}] = animationEntry;
                            animateToken(tokens[caseId][tokenId], path, onComplete);
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
                    animateToken(token, tokenData.path, onComplete, duration);
                });
            }

            function animateToken(token: Token, path: Waypoint[], onComplete: () => void, duration: number = delta) {
                const startTime = performance.now();
                let pathLength = calculatePathLength(path);

                function animate(time: number) {
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
                            placeToken(token, x.toString(), y.toString());
                            break;
                        }
                        accumulatedDistance += segmentLength;
                    }

                    if (progress < 1) requestAnimationFrame(animate);
                    else onComplete();
                }

                requestAnimationFrame(animate);
            }

            this.start = async () => {
                viewport = canvas.getContainer().querySelector('svg g[data-element-id]');
                batches = simulationData.deltas_mockup;

                simulationData.frame_mockup.forEach(frameCase => {
                    createTokensForFrame(frameCase);
                });

                for (const batch of batches) {
                    if (batch.length === 0) await new Promise(resolve => setTimeout(resolve, delta));
                    else {
                        const eventsByCaseId: EventsByCaseId = {};
                        batch.forEach((event) => {
                            if (!eventsByCaseId[event.case_id]) eventsByCaseId[event.case_id] = [];
                            eventsByCaseId[event.case_id].push(event);
                        });

                        await Promise.all(
                            Object.entries(eventsByCaseId).map(([caseId, batchEvents]) =>
                                handleBatchEvents({ caseId, batchEvents })
                            )
                        );
                    }
                }
            }
        }],
    }
};

export default simulateToken;
