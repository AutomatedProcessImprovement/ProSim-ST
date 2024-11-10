import {Canvas, ElementRegistry, Flow, Waypoint} from "@definitions/simulation/interfaces";
import {getRandomColor} from "@utils/colors";
import {Batch, BatchEvent, EventsByCaseId, FrameCase, SimulationData, Tokens} from "@definitions/simulation/types";
import {ElementTypes, LifecycleTypes} from "@definitions/simulation/enums";

const simulateToken = (simulationData: SimulationData) => {
    return {
        __init__: ['tokenSimulation'],
        tokenSimulation: ['type', function(canvas: Canvas, elementRegistry: ElementRegistry) {
            const delta = 2000; // milliseconds
            const tokens: Tokens = {};
            let viewport: HTMLDivElement;
            let batches: Batch[];

            function createToken(frameCase: FrameCase) {
                tokens[frameCase.case_id] = [];
                frameCase.active_elements.forEach(activeElement => {
                    const token = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    token.setAttribute("r", "10");
                    token.setAttribute("fill", getRandomColor());
                    token.classList.add("token");
                    const startElement = elementRegistry.get(activeElement);

                    if (startElement?.type === ElementTypes.FLOW) {
                        const waypoints = startElement.waypoints;
                        const endWaypoint = waypoints[waypoints.length - 1];
                        if (endWaypoint) {
                            placeToken(token, endWaypoint.x.toString(), endWaypoint.y.toString());
                            viewport.appendChild(token);
                            tokens[frameCase.case_id].push(token);
                        }
                    } else if (startElement?.type === ElementTypes.TASK) {
                        const { x, y, width, height } = startElement;
                        const centerX = x + width / 2;
                        const centerY = y + height / 2;
                        placeToken(token, centerX.toString(), centerY.toString());
                        viewport.appendChild(token);
                        tokens[frameCase.case_id].push(token);
                    } else {
                        console.warn(`This type of element is not handled.`);
                    }
                });
            }

            function handleBatchEvents(batchEvents: Array<BatchEvent>): Promise<void> {
                return new Promise((resolve: () => void) => {
                    const token = tokens[batchEvents[0].case_id][0];
                    let path: Array<Waypoint> = [{
                        x: parseFloat(token.getAttribute("cx")),
                        y: parseFloat(token.getAttribute("cy")),
                    }];

                    batchEvents.forEach(batchEvent => {
                        switch (batchEvent.lifecycle) {
                            case LifecycleTypes.START:
                                const targetActivity = elementRegistry.get(batchEvent.activity_id);
                                const {x: targetActivityX, y: targetActivityY, width, height} = targetActivity;
                                const endPoint: Waypoint = {
                                    x: targetActivityX + width / 2,
                                    y: targetActivityY + height / 2
                                };
                                path.push(endPoint);
                                break;
                            case LifecycleTypes.ENABLED:
                            case LifecycleTypes.COMPLETE:
                            case LifecycleTypes.END:
                                batchEvent.flow_path.forEach(elementId => {
                                    if (!elementId.startsWith("Flow_")) return;

                                    const flowElement = elementRegistry.get(elementId) as Flow;
                                    path = [...path, ...flowElement.waypoints];
                                });
                                break;
                            default:
                                break;
                        }
                    });

                    animateToken(token, path, resolve);
                });
            }

            function animateToken(token: SVGCircleElement, path: Waypoint[], onComplete: () => void) {
                if (!path || path.length <= 1) {
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

            function placeToken(token: SVGCircleElement, x: string, y: string) {
                token.setAttribute("cx", x);
                token.setAttribute("cy", y);
            }

            this.start = async () => {
                viewport = canvas.getContainer().querySelector('svg g[data-element-id]');
                batches = Object.keys(simulationData)
                    .filter(key => key.startsWith("delta_"))
                    .map(key => simulationData[key]);

                simulationData.frame_mockup.forEach(frameCase => {
                    createToken(frameCase);
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
                        await Promise.all(Object.values(eventsByCaseId).map(batchEvents => handleBatchEvents(batchEvents)));
                    }
                }
            }
        }],
    }
};

export default simulateToken;
