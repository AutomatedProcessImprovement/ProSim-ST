import {Canvas, ElementInterface} from "@utils/customTypes/simulation/interfaces";
import {getRandomColor} from "@utils/colors";
import {FrameCase, SimulationData, Tokens} from "@utils/customTypes/simulation/types";
import {ElementTypes} from "@utils/customTypes/simulation/enums";

const simulateToken = (simulationData: SimulationData) => {
    return {
        __init__: ['tokenSimulation'],
        tokenSimulation: ['type', function(canvas: Canvas, elementRegistry: ElementInterface) {
            let tokens: Tokens;
            let viewport;

            function createToken(frameCase: FrameCase) {
                tokens[frameCase.case_id] = [];
                frameCase.active_elements.forEach(active_element => {
                    const token = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    token.setAttribute("r", "10");
                    token.setAttribute("fill", getRandomColor());
                    token.classList.add("token");
                    tokens[frameCase.case_id].push(token);
                    viewport.appendChild(token);
                    const startElement = elementRegistry.get(active_element);

                    if (startElement?.type === ElementTypes.Flow) {
                        const waypoints = startElement.waypoints;
                        const endWaypoint = waypoints[waypoints.length - 1];
                        if (endWaypoint) {
                            token.setAttribute("cx", endWaypoint.x.toString());
                            token.setAttribute("cy", endWaypoint.y.toString());
                        }
                    } else if (startElement?.type === ElementTypes.Task) {
                        const { x, y, width, height } = startElement;
                        const centerX = x + width / 2;
                        const centerY = y + height / 2;
                        token.setAttribute("cx", centerX.toString());
                        token.setAttribute("cy", centerY.toString());
                    } else {
                        console.warn(`This type of element is not handled.`);
                    }
                });
            }

            this.start = () => {
                tokens = {};
                viewport = canvas.getContainer().querySelector('svg g[data-element-id]');

                simulationData.frame_mockup.forEach(frameCase => {
                    createToken(frameCase);
                });
            }
        }],
    }
};

export default simulateToken;
