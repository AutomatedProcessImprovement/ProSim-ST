import {Canvas, ElementRegistry, EventBus, Flow, Node} from "@definitions/simulation/interfaces";
import {ColorMode, InitialView, SimulationHooks, WTPTState} from "@definitions/simulation/types";
import {SimulationData} from "@definitions/api/types";
import {Dispatch, SetStateAction} from "react";
import {createCaseHistory} from "@modules/simulation/caseHistory";
import {createClock} from "@modules/simulation/clock";
import {createDots} from "@modules/simulation/dotLayout";
import {createHover} from "@modules/simulation/hover";
import {createPlayback} from "@modules/simulation/playback";
import {isTaskType} from "@modules/simulation/restLayout";
import {createTaskCounts} from "@modules/simulation/taskCounts";

const SVG_NS = "http://www.w3.org/2000/svg";

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
            const getElement = (elementId: string): Flow | Node | undefined => elementRegistry.get(elementId);
            const clock = createClock(simulationData);
            const history = createCaseHistory(hooks, simulationData.frames.map(frame => frame.caseId));
            const dots = createDots({
                getElement,
                clock,
                history,
                hooks,
                colorMode: initialView.colorMode ?? "state",
                onLayout: () => counts.render(),
            });
            const counts = createTaskCounts({getElement, elementRegistry, dots, hooks});
            const hover = createHover({canvas, getElement, clock, dots, history, hooks});
            const playback = createPlayback({
                simulationData,
                caseNumberSetter,
                wtptSetter,
                hooks,
                initialView,
                getElement,
                clock,
                dots,
                history,
            });

            this.setColorMode = (mode: ColorMode) => dots.setColorMode(mode);
            this.setFollowedCase = (caseId: number | null) => dots.setFollowedCase(caseId);
            this.describeCase = (caseId: number) => hover.describeCase(caseId);
            this.getTaskQueue = (taskId: string) => dots.getTaskQueue(taskId);
            this.getCurrentTime = () => clock.current?.getTime() ?? null;

            this.start = () => {
                const viewport = canvas.getContainer().querySelector('svg g[data-element-id]');
                const tokenLayer = document.createElementNS(SVG_NS, "g");
                tokenLayer.classList.add("token-layer");
                const badgeLayer = document.createElementNS(SVG_NS, "g");
                badgeLayer.classList.add("badge-layer");
                viewport.appendChild(tokenLayer);
                viewport.appendChild(badgeLayer);
                dots.attach(tokenLayer);
                counts.attach(badgeLayer);

                hover.enable(tokenLayer);
                if (dots.colorMode() === "age") dots.setColorMode("age");

                eventBus?.on("element.click", ({element}) => {
                    if (element && isTaskType(element.type)) hooks.onTaskClick?.(element.id);
                });
                eventBus?.on("diagram.destroy", () => {
                    playback.stop();
                    dots.stop();
                    counts.stop();
                });

                playback.start();
            }
        };

    (tokenSimulation as typeof tokenSimulation & { $inject: string[] }).$inject = ['canvas', 'elementRegistry', 'eventBus'];

    return {
        __init__: ['tokenSimulation'],
        tokenSimulation: ['type', tokenSimulation],
    }
};


export default simulation;
