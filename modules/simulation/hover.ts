import {Canvas, Flow, Node} from "@definitions/simulation/interfaces";
import {SimulationHooks} from "@definitions/simulation/types";
import {formatDuration, formatShortDate} from "@utils/dateHelpers";
import {CaseHistory} from "@modules/simulation/caseHistory";
import {nowOf, SimulationClock} from "@modules/simulation/clock";
import {Dots, tokenKey} from "@modules/simulation/dotLayout";
import {isTaskType} from "@modules/simulation/restLayout";

type Options = {
    canvas: Canvas;
    getElement: (elementId: string) => Flow | Node | undefined;
    clock: SimulationClock;
    dots: Dots;
    history: CaseHistory;
    hooks: SimulationHooks;
};

export function createHover({canvas, getElement, clock, dots, history, hooks}: Options) {
    const tokenTooltip = document.getElementById('token-tooltip');

    function elementName(elementId: string) {
        return getElement(elementId)?.businessObject?.name?.trim() || elementId;
    }

    function describeToken(caseId: number, tokenId: string): string[] {
        const now = nowOf(clock);
        const lines = [`Case ${caseId}`];
        const rest = dots.rests.get(tokenKey(caseId, tokenId));
        const since = rest ? history.sinceOf(rest) : null;
        const here = since !== null ? ` for ${formatDuration(now - since)}` : "";

        if (!rest) lines.push("Moving");
        else if (rest.place.kind === "waiting") lines.push(`Waiting for ${elementName(rest.place.taskId)}${here}`);
        else if (rest.place.kind === "working") lines.push(`In work: ${elementName(rest.place.taskId)}${here}`);
        else if (rest.place.kind === "sync") lines.push("Waiting for its parallel branches");
        else lines.push(`At ${elementName(rest.elementId)}`);

        const arrival = history.arrivalOf(caseId);
        if (arrival !== null) lines.push(`Case open ${formatDuration(now - arrival)}`);
        else if (history.wasOpenAtStart(caseId)) lines.push(`Open since before ${formatShortDate(clock.initial, clock.utcOffset, true)}`);
        return lines;
    }

    function describeTask(taskId: string): string[] {
        const {waiting = 0, inWork = 0} = dots.taskLoad()[taskId] ?? {};
        return [elementName(taskId), `${waiting} waiting · ${inWork} in work`];
    }

    function describeHovered(target: Element): string[] | null {
        if (target.classList?.contains("token")) {
            const caseId = Number(target.getAttribute("data-case"));
            const lines = describeToken(caseId, target.getAttribute("data-token"));
            return dots.isFollowed(caseId) ? lines : [...lines, "Click to follow this case"];
        }
        const taskId = target.closest?.(".djs-shape")?.getAttribute("data-element-id");
        return taskId && isTaskType(getElement(taskId)?.type) ? describeTask(taskId) : null;
    }

    function describeCase(caseId: number): string[] {
        const details = dots.tokenIdsOf(caseId).map(tokenId => describeToken(caseId, tokenId).slice(1));
        const places = new Set(details.map(lines => lines[0]));
        return [...places, ...details.slice(0, 1).flatMap(lines => lines.slice(1))];
    }

    function enable(tokenLayer: SVGGElement) {
        const surface = canvas.getContainer();

        let pressedAt: {x: number; y: number} | null = null;
        tokenLayer.addEventListener("mousedown", event => { pressedAt = {x: event.clientX, y: event.clientY}; });
        tokenLayer.addEventListener("click", event => {
            const target = event.target as Element;
            const dragged = pressedAt && Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y) > 4;
            if (dragged || !target.classList?.contains("token")) return;
            hooks.onCaseClick?.(Number(target.getAttribute("data-case")));
        });

        if (!tokenTooltip) return;

        const show = (event: MouseEvent) => {
            const lines = describeHovered(event.target as Element);
            if (!lines) return;
            tokenTooltip.replaceChildren(...lines.map((line, index) => {
                const div = document.createElement("div");
                if (index === 0) div.className = "token-tooltip-title";
                div.textContent = line;
                return div;
            }));
            tokenTooltip.style.display = "block";
            move(event);
        };
        const move = (event: MouseEvent) => {
            tokenTooltip.style.left = `${event.clientX + 12}px`;
            tokenTooltip.style.top = `${event.clientY + 12}px`;
        };
        const hide = () => { tokenTooltip.style.display = "none"; };

        surface.addEventListener("mouseover", show);
        surface.addEventListener("mousemove", move);
        surface.addEventListener("mouseout", hide);
        surface.addEventListener("click", hide);
    }

    return {enable, describeCase};
}
