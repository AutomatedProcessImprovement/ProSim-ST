import {getRandomColor} from "@modules/simulation/util";

const simulateToken = (simulationData) => {
    return {
        __init__: ['tokenSimulation'],
        tokenSimulation: ['type', function(canvas, elementRegistry) {
            const tokens = new Array(simulationData.length);
            const paths = new Array(simulationData.length);

            function createToken(startElementId, index) {
                tokens[index] = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                tokens[index].setAttribute("r", "10");
                tokens[index].setAttribute("fill", getRandomColor());
                tokens[index].classList.add("token");

                const viewport = canvas.getContainer().querySelector('svg g[data-element-id]');
                viewport.appendChild(tokens[index]);

                const startElement = elementRegistry.get(startElementId);
                const { x, y } = startElement?.outgoing[0]?.waypoints[0];
                if (x && y) {
                    console.log(x, y)
                    tokens[index].setAttribute("transform", `translate(${x}, ${y})`);
                }
            }

            function deriveTokenPath(batch, index) {
                paths[index] = [];
                for (let i = 0; i < batch.length - 1; i++) {
                    const currentElementId = batch[i];
                    const nextElementId = batch[i + 1];

                    const currentElement = elementRegistry.get(currentElementId);
                    const connection = currentElement?.outgoing.find(conn => conn.target.id === nextElementId);

                    if (connection) {
                        connection.waypoints.forEach(point => {
                            paths[index].push({x: point.x, y: point.y});
                        });
                    } else {
                        console.warn(`No connection from ${currentElementId} to ${nextElementId}`);
                    }
                }
            }

            function moveTokens() {
                tokens.forEach((token, index) => {
                    const path = paths[index]
                    if (!path || path.length === 0) return;

                    const delta = 2000;
                    const startTime = performance.now();

                    function animateToken(time) {
                        const elapsedTime = time - startTime;
                        const progress = Math.min(elapsedTime / delta, 1); // from 0 to 1 over the duration

                        // Calculate the total path length
                        let pathLength = 0;
                        for (let i = 0; i < path.length - 1; i++) {
                            const dx = path[i + 1].x - path[i].x;
                            const dy = path[i + 1].y - path[i].y;
                            pathLength += Math.sqrt(dx * dx + dy * dy);
                        }

                        // Determine current distance based on progress
                        const currentDistance = progress * pathLength;

                        // Find the current segment based on the distance
                        let accumulatedDistance = 0;
                        for (let i = 0; i < path.length - 1; i++) {
                            const segmentStart = path[i];
                            const segmentEnd = path[i + 1];
                            const dx = segmentEnd.x - segmentStart.x;
                            const dy = segmentEnd.y - segmentStart.y;
                            const segmentLength = Math.sqrt(dx * dx + dy * dy);

                            if (accumulatedDistance + segmentLength >= currentDistance) {
                                // Interpolate within this segment
                                const segmentProgress = (currentDistance - accumulatedDistance) / segmentLength;
                                const x = segmentStart.x + dx * segmentProgress;
                                const y = segmentStart.y + dy * segmentProgress;
                                token.setAttribute("transform", `translate(${x}, ${y})`);
                                break;
                            }

                            accumulatedDistance += segmentLength;
                        }

                        if (progress < 1) {
                            requestAnimationFrame(animateToken);
                        }
                    }

                    requestAnimationFrame(animateToken);
                });
            }

            this.start = () => {
                simulationData.forEach((batches, index) => {
                    createToken(batches[0], index);
                    deriveTokenPath(batches, index);
                });
                console.log(paths);
                moveTokens();
            };
        }],
    }
};

export default simulateToken;
