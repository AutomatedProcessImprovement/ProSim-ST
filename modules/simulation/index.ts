import {Canvas, ElementRegistry, Node, Waypoint} from "@definitions/simulation/interfaces";
import {getRandomColor} from "@utils/colors";
import {
    AnimationData,
    Batch,
    BatchEvent,
    EventsByCaseId,
    FrameCase,
    SimulationData,
    Token,
    Tokens
} from "@definitions/simulation/types";
import {FlowTypes, LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";

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

                const token = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                token.setAttribute("r", "10");
                token.setAttribute("fill", color);
                token.classList.add("token");
                const activeElement = elementRegistry.get(activeElementId);

                if (activeElement?.type === FlowTypes.FLOW) {
                    const waypoints = activeElement.waypoints;
                    const endWaypoint = waypoints[waypoints.length - 1];
                    if (endWaypoint) {
                        placeToken(token, endWaypoint.x.toString(), endWaypoint.y.toString());
                        if (show) viewport.appendChild(token);
                        tokens[caseId][tokenId] = token;
                    }
                } else {
                    const { x: centerX, y: centerY } = calculateCenterPoint(activeElement);
                    placeToken(token, centerX.toString(), centerY.toString());
                    if (show) viewport.appendChild(token);
                    tokens[caseId][tokenId] = token;
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

            function handleBatchEvents({caseId, batchEvents}: {
                caseId: string;
                batchEvents: Array<BatchEvent>;
            }): Promise<void> {
                return new Promise((resolve: () => void) => {
                    let isAsyncAnimation = batchEvents.some(batchEvent => Object.keys(batchEvent.paths).length > 1);

                    if (isAsyncAnimation) {
                        let asyncAnimationData: AnimationData = {};

                        batchEvents.forEach(batchEvent => {
                            const batchEventPathEntries = Object.entries(batchEvent.paths);

                            batchEventPathEntries.forEach(([tokenId, elements]) => {
                                let path: Array<Waypoint> = [];
                                let nextTokenIds: string[];
                                let token: Token;

                                const tokensOfCurrentCase = tokens[caseId];
                                if (tokensOfCurrentCase?.[tokenId]) {
                                    token = tokensOfCurrentCase[tokenId];
                                } else {
                                    const [color, show]: [string, boolean] = tokensOfCurrentCase
                                        ? [Object.values(tokensOfCurrentCase)[0].getAttribute("fill"), false]
                                        : [getRandomColor(), true];
                                    token = createToken(elements[0], caseId, tokenId, color, show);
                                }

                                if (!asyncAnimationData[tokenId]) path.push(getTokenCoordinates(token));
                                elements.forEach((elementId, index) => {
                                    const element = elementRegistry.get(elementId);
                                    if (!element) {
                                        console.warn(`The element ${elementId} does not exist!`);
                                        return;
                                    }

                                    if (element.type === FlowTypes.FLOW) path = [...path, ...element.waypoints];
                                    else {
                                        const centerPoint = calculateCenterPoint(element);
                                        const lastPoint = path.length ?
                                            path[path.length - 1] :
                                            asyncAnimationData[tokenId].path[asyncAnimationData[tokenId].path.length - 1];
                                        if (lastPoint.x !== centerPoint.x || lastPoint.y !== centerPoint.y) path.push(centerPoint);

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

                                if (!asyncAnimationData[tokenId]) asyncAnimationData[tokenId] = { path, nextTokenIds };
                                else {
                                    asyncAnimationData[tokenId] = {
                                        path: [...asyncAnimationData[tokenId].path, ...path],
                                        nextTokenIds,
                                    };
                                }

                                if (batchEvent.lifecycle === LifecycleTypes.CASE_END) {
                                    asyncAnimationData[tokenId].onComplete = () => {
                                        resolve();
                                        setTimeout(() => {
                                            viewport.removeChild(token);
                                            delete tokens[caseId][tokenId];
                                        }, delta);
                                    };
                                }
                            });
                        });

                        startAsyncAnimations(asyncAnimationData, caseId, resolve, calculateLongestPath(asyncAnimationData));
                    } else {
                        let syncAnimationData: AnimationData = {};

                        batchEvents.forEach(batchEvent => {
                            const batchEventPathEntries = Object.entries(batchEvent.paths);
                            if (batchEventPathEntries.length) {
                                const [tokenId, elements] = batchEventPathEntries[0];
                                let token = tokens[caseId] ? tokens[caseId][tokenId] : createToken(elements[0], caseId, tokenId, getRandomColor());
                                let path: Array<Waypoint> = [];

                                if (!syncAnimationData[tokenId]) path.push(getTokenCoordinates(token));
                                elements.forEach(elementId => {
                                    const element = elementRegistry.get(elementId);
                                    if (!element) {
                                        console.warn(`The element ${elementId} does not exists!`);
                                        return;
                                    }
                                    if (element.type === FlowTypes.FLOW) path = [...path, ...element.waypoints];
                                    else {
                                        const centerPoint = calculateCenterPoint(element);
                                        const lastPoint = path.length ?
                                            path[path.length - 1] :
                                            syncAnimationData[tokenId].path[syncAnimationData[tokenId].path.length - 1];
                                        if (lastPoint.x !== centerPoint.x || lastPoint.y !== centerPoint.y) path.push(centerPoint);
                                    }
                                });

                                if (!syncAnimationData[tokenId]) syncAnimationData[tokenId] = { path };
                                else syncAnimationData[tokenId] = { path: [...syncAnimationData[tokenId].path, ...path] };

                                if (batchEvent.lifecycle === LifecycleTypes.CASE_END) {
                                    syncAnimationData[tokenId].onComplete = () => {
                                        resolve();
                                        setTimeout(() => {
                                            viewport.removeChild(token);
                                            delete tokens[caseId][tokenId];
                                        }, delta);
                                    }
                                } else {
                                    syncAnimationData[tokenId].onComplete = resolve;
                                }
                            }
                        });

                        if (Object.keys(syncAnimationData).length === 0) setTimeout(resolve, delta);
                        else Object.entries(syncAnimationData).forEach(animationEntry => {
                            const [tokenId, {path, onComplete}] = animationEntry;
                            animateToken(tokens[caseId][tokenId], path, onComplete);
                        });
                    }
                });
            }

            function calculateLongestPath(asyncAnimationData: AnimationData): number {
                let longestPath = 0;

                function findLongestPath(tokenId: string, currentPath: Waypoint[] = []) {
                    const tokenData = asyncAnimationData[tokenId];
                    const mergedPath = [...currentPath, ...tokenData.path];
                    const mergedPathLength = calculatePathLength(mergedPath);

                    if (!(tokenData.nextTokenIds && tokenData.nextTokenIds.length)) {
                        if (mergedPathLength > longestPath) longestPath = mergedPathLength;
                    }

                    const nextTokenIds = tokenData.nextTokenIds || [];
                    nextTokenIds.forEach(nextTokenId => {
                        findLongestPath(nextTokenId, mergedPath);
                    });
                }

                const rootTokenIds = Object.keys(asyncAnimationData).filter(tokenId =>
                    !Object.values(asyncAnimationData).some(data => data.nextTokenIds?.includes(tokenId))
                );

                rootTokenIds.forEach(rootTokenId => {
                    findLongestPath(rootTokenId);
                });

                return longestPath;
            }

            function startAsyncAnimations(asyncAnimationData: AnimationData, caseId: string, resolve: () => void, longestPath: number, isHidden: boolean = false) {
                const rootTokenIds = Object.keys(asyncAnimationData).filter(tokenId => {
                    return !Object.values(asyncAnimationData).some(data => data.nextTokenIds?.includes(tokenId));
                });

                if (rootTokenIds.length === 0) {
                    console.warn("No root tokens found in asyncAnimationData.");
                    resolve();
                    return;
                }

                const duration = rootTokenIds.reduce((maxDuration, rootTokenId) => {
                    const currentDuration = calculatePathLength(asyncAnimationData[rootTokenId].path) * delta / longestPath;
                    return currentDuration > maxDuration ? currentDuration : maxDuration;
                }, 0);

                let nextTokenIds = [];
                rootTokenIds.forEach((rootTokenId, index) => {
                    const token = tokens[caseId][rootTokenId];
                    if (isHidden) viewport.appendChild(token);
                    const asyncAnimationDataOfRootToken = asyncAnimationData[rootTokenId];
                    const onComplete = () => {
                        const nextTokenIdsOfRootToken = asyncAnimationDataOfRootToken.nextTokenIds ?? [];
                        if (nextTokenIdsOfRootToken.length) deleteToken(caseId, rootTokenId);
                        nextTokenIds = [...new Set([...nextTokenIds, ...nextTokenIdsOfRootToken])];
                        if (index === rootTokenIds.length - 1) {
                            if (nextTokenIds && nextTokenIds.length) {
                                const nextAsyncAnimationEntries = Object.entries(asyncAnimationData)
                                    .filter(([tokenId, _]) => !rootTokenIds.includes(tokenId));
                                const nextAsyncAnimationData: AnimationData = Object.fromEntries(nextAsyncAnimationEntries);
                                startAsyncAnimations(nextAsyncAnimationData, caseId, resolve, longestPath, true);
                            } else resolve();
                        }
                    }
                    animateToken(token, asyncAnimationDataOfRootToken.path, onComplete, duration);
                });
            }

            function animateToken(token: Token, path: Waypoint[], onComplete: () => void, duration: number = delta) {
                const startTime = performance.now();

                function animate(time: number) {
                    const elapsedTime = time - startTime;
                    const progress = Math.min(elapsedTime / duration, 1);
                    let pathLength = calculatePathLength(path);
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

                    if (progress < 1) {
                        requestAnimationFrame(animate);
                    } else {
                        onComplete();
                    }
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
                            if (!eventsByCaseId[event.case_id]) {
                                eventsByCaseId[event.case_id] = [];
                            }
                            eventsByCaseId[event.case_id].push(event);
                        });

                        await Promise.all(Object.entries(eventsByCaseId).map(
                            ([caseId, batchEvents]) => handleBatchEvents({
                                caseId,
                                batchEvents
                            })
                        ));
                    }
                }
            }
        }],
    }
};

export default simulateToken;
