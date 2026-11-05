import {ElementRegistry, Flow, Node, Waypoint} from "@definitions/simulation/interfaces";
import {SimulationHooks} from "@definitions/simulation/types";
import {FlowTypes} from "@definitions/simulation/enums";
import {Dots} from "@modules/simulation/dotLayout";
import {clearPillSpot, heatOpacity, pillWidth} from "@modules/simulation/restLayout";

const SVG_NS = "http://www.w3.org/2000/svg";

type Options = {
    getElement: (elementId: string) => Flow | Node | undefined;
    elementRegistry: ElementRegistry;
    dots: Dots;
    hooks: SimulationHooks;
};

export function createTaskCounts({getElement, elementRegistry, dots, hooks}: Options) {
    let badgeLayer: SVGGElement;
    let lastLoadReport = 0;
    let loadReportTimeout: ReturnType<typeof setTimeout> | null = null;

    const pills = new Map<string, {waiting: SVGGElement; inWork: SVGGElement}>();
    const otherPills = new Map<string, SVGGElement>();
    const shadedTasks = new Set<string>();
    const originalFills = new Map<string, string>();

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

    function placeTarget(groupId: string): string | undefined {
        const element = getElement(groupId);
        return element?.type === FlowTypes.FLOW ? element.target?.id : groupId;
    }

    function renderOtherLoad() {
        const overflowingTargets = new Set<string>();
        dots.overflowing.forEach((place, groupId) => {
            if (place.kind !== "sync" && place.kind !== "other") return;
            const target = placeTarget(groupId);
            if (target) overflowingTargets.add(target);
        });

        const counts = new Map<string, number>();
        if (overflowingTargets.size) dots.rests.forEach(rest => {
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
            hooks.onTaskLoad?.(dots.taskLoad());
        }, wait);
    }

    function render() {
        if (!badgeLayer) return;
        const taskLoad = dots.taskLoad();
        let maxWaiting = 0;
        Object.values(taskLoad).forEach(({waiting}) => { maxWaiting = Math.max(maxWaiting, waiting); });

        const overflowingTasks = {waiting: new Set<string>(), working: new Set<string>()};
        dots.overflowing.forEach(place => {
            if (place.taskId && (place.kind === "waiting" || place.kind === "working")) overflowingTasks[place.kind].add(place.taskId);
        });

        const taskIds = new Set([...Object.keys(taskLoad), ...shadedTasks, ...pills.keys()]);
        taskIds.forEach(taskId => {
            const shape = getElement(taskId) as Node | undefined;
            if (!shape) return;
            const {waiting = 0, inWork = 0} = taskLoad[taskId] ?? {};

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

    return {
        render,
        attach: (layer: SVGGElement) => { badgeLayer = layer; },
        stop: () => { if (loadReportTimeout) clearTimeout(loadReportTimeout); },
    };
}
