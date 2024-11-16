import {Canvas, ElementRegistry, Node, Waypoint} from "@definitions/simulation/interfaces";
import {getRandomColor} from "@utils/colors";
import {
    Batch,
    BatchEvent,
    EventsByCaseId,
    FrameCase,
    SimulationData,
    Token,
    Tokens
} from "@definitions/simulation/types";
import {FlowTypes, LifecycleTypes} from "@definitions/simulation/enums";

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

            function createToken(activeElementId: string, caseId: string, tokenId: string, color: string): Token {
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
                        viewport.appendChild(token);
                        tokens[caseId][tokenId] = token;
                    }
                } else {
                    const { x: centerX, y: centerY } = calculateCenterPoint(activeElement);
                    placeToken(token, centerX.toString(), centerY.toString());
                    viewport.appendChild(token);
                    tokens[caseId][tokenId] = token;
                }

                return token;
            }

            function handleBatchEvents({caseId, batchEvents}: {
                caseId: string;
                batchEvents: Array<BatchEvent>;
            }): Promise<void> {
                return new Promise((resolve: () => void) => {
                    let token: Token;
                    let path: Array<Waypoint> = [];

                    batchEvents.forEach(batchEvent => {
                        const batchEventEntries = Object.entries(batchEvent.paths);
                        const [ tokenId, elements ] = batchEventEntries.length ? batchEventEntries[0] : ['', new Array<string>()];

                        switch (batchEvent.lifecycle) {
                            case LifecycleTypes.CASE_ARRIVAL:
                                token = createToken(elements[0], caseId, tokenId, getRandomColor());
                                break;
                            case LifecycleTypes.START:
                                token = tokens[caseId][tokenId];
                                path.push(getTokenCoordinates(token));
                                break;
                            case LifecycleTypes.ENABLE:
                                if (tokenId) {
                                    token = tokens[caseId][tokenId];
                                    path.push(getTokenCoordinates(token));
                                }
                                break;
                            case LifecycleTypes.COMPLETE:
                                token = tokens[caseId][tokenId];
                                break;
                            case LifecycleTypes.CASE_END:
                                token = tokens[caseId][tokenId];
                                path.push(getTokenCoordinates(token));
                                resolve = () => {
                                    setTimeout(() => {
                                        viewport.removeChild(token);
                                        delete tokens[caseId][tokenId];
                                    }, delta);
                                }
                                break;
                        }

                        elements.forEach(elementId => {
                            const element = elementRegistry.get(elementId);
                            if (!element) {
                                console.warn(`The element ${elementId} does not exists!`);
                                return;
                            }
                            if (element.type === FlowTypes.FLOW) path = [...path, ...element.waypoints];
                            else path.push(calculateCenterPoint(element));
                        });
                    });

                    animateToken(token, path, resolve);
                });
            }

            function animateToken(token: Token, path: Waypoint[], onComplete: () => void) {
                if (!path || path.length <= 1 || !token) {
                    setTimeout(onComplete, delta);
                    return;
                }

                const startTime = performance.now();

                function animate(time: number) {
                    const elapsedTime = time - startTime;
                    const progress = Math.min(elapsedTime / delta, 1);

                    let pathLength = 0;
                    for (let i = 0; i < path.length - 1; i++) {
                        const dx = path[i + 1].x - path[i].x;
                        const dy = path[i + 1].y - path[i].y;
                        pathLength += Math.sqrt(dx * dx + dy * dy);
                    }

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

                // for (const batch of batches) {
                //     if (batch.length === 0) await new Promise(resolve => setTimeout(resolve, delta));
                //     else {
                //         const eventsByCaseId: EventsByCaseId = {};
                //         batch.forEach((event) => {
                //             if (!eventsByCaseId[event.case_id]) {
                //                 eventsByCaseId[event.case_id] = [];
                //             }
                //             eventsByCaseId[event.case_id].push(event);
                //         });
                //
                //         await Promise.all(Object.entries(eventsByCaseId).map(
                //             ([caseId, batchEvents]) => handleBatchEvents({
                //                 caseId,
                //                 batchEvents
                //             })
                //         ));
                //     }
                // }
            }
        }],
    }
};

export default simulateToken;
