import {Flow, Node, Waypoint} from "@definitions/simulation/interfaces";
import {ColorMode, FrameCase, QueueEntry, SimulationHooks, TaskLoad, Token, Tokens} from "@definitions/simulation/types";
import {FlowTypes} from "@definitions/simulation/enums";
import {CaseHistory} from "@modules/simulation/caseHistory";
import {nowOf, SimulationClock} from "@modules/simulation/clock";
import {
    ageColor,
    classifyRest,
    DOT_RADIUS,
    Rest,
    RestPlace,
    slotCapacity,
    slotPosition,
    STATE_COLORS,
} from "@modules/simulation/restLayout";

const SVG_NS = "http://www.w3.org/2000/svg";

type Options = {
    getElement: (elementId: string) => Flow | Node | undefined;
    clock: SimulationClock;
    history: CaseHistory;
    hooks: SimulationHooks;
    colorMode: ColorMode;
    onLayout: () => void;
};

export type Dots = ReturnType<typeof createDots>;

export const tokenKey = (caseId: number, tokenId: string) => `${caseId}|${tokenId}`;

export function calculateCenterPoint(shape: Node): Waypoint {
    const {x, y, width, height} = shape;

    return {
        x: x + width / 2,
        y: y + height / 2,
    }
}

export function getTokenCoordinates(token: Token): Waypoint {
    return {
        x: Number(token.getAttribute("cx")),
        y: Number(token.getAttribute("cy")),
    }
}

function setTokenPosition(token: Token, {x, y}: Waypoint) {
    token.setAttribute("cx", x.toString());
    token.setAttribute("cy", y.toString());
}

export function createDots({getElement, clock, history, hooks, colorMode: initialColorMode, onLayout}: Options) {
    let tokenLayer: SVGGElement;
    let tokens: Tokens = {};
    let colorMode = initialColorMode;
    let followedCase: number | null = null;
    let agePaintInterval: ReturnType<typeof setInterval> | null = null;
    let layoutScheduled = false;

    const rests = new Map<string, Rest>();
    const groups = new Map<string, Set<string>>();
    const animating = new Set<string>();
    const taskCounts = new Map<string, {waiting: number; inWork: number}>();
    const dirtyGroups = new Set<string>();
    const overflowing = new Map<string, RestPlace>();

    function tokenColor(caseId: number, tokenId: string) {
        if (colorMode === "age") {
            const arrival = history.arrivalOf(caseId);
            return ageColor(arrival === null ? null : nowOf(clock) - arrival, hooks.getAverageCycleTime?.() ?? null);
        }
        const rest = rests.get(tokenKey(caseId, tokenId));
        return STATE_COLORS[rest ? rest.place.kind : "moving"];
    }

    function paintToken(caseId: number, tokenId: string) {
        tokens[caseId]?.[tokenId]?.setAttribute("fill", tokenColor(caseId, tokenId));
    }

    function paintAllTokens() {
        Object.entries(tokens).forEach(([caseId, caseTokens]) => {
            Object.keys(caseTokens).forEach(tokenId => paintToken(Number(caseId), tokenId));
        });
    }

    function adjustTaskCount(place: RestPlace, change: number) {
        if (!place.taskId || (place.kind !== "waiting" && place.kind !== "working")) return;
        const counts = taskCounts.get(place.taskId) ?? {waiting: 0, inWork: 0};
        if (place.kind === "waiting") counts.waiting += change;
        else counts.inWork += change;
        taskCounts.set(place.taskId, counts);
    }

    function markDirty(groupId: string) {
        dirtyGroups.add(groupId);
        if (layoutScheduled) return;
        layoutScheduled = true;
        requestAnimationFrame(flushLayout);
    }

    function removeRest(key: string) {
        const rest = rests.get(key);
        if (!rest) return;
        rests.delete(key);
        groups.get(rest.place.groupId)?.delete(key);
        adjustTaskCount(rest.place, -1);
        markDirty(rest.place.groupId);
    }

    function settle(caseId: number, tokenId: string, elementId: string) {
        const key = tokenKey(caseId, tokenId);
        removeRest(key);
        if (!tokens[caseId]?.[tokenId]) return;

        const place = classifyRest(elementId, getElement(elementId));
        if (place) {
            rests.set(key, {caseId, tokenId, elementId, place});
            if (!groups.has(place.groupId)) groups.set(place.groupId, new Set());
            groups.get(place.groupId).add(key);
            adjustTaskCount(place, 1);
            markDirty(place.groupId);
        }
        paintToken(caseId, tokenId);
    }

    function unsettle(caseId: number, tokenId: string) {
        removeRest(tokenKey(caseId, tokenId));
        const token = tokens[caseId]?.[tokenId];
        if (!token) return;
        token.style.visibility = "";
        paintToken(caseId, tokenId);
    }

    function layoutGroup(groupId: string) {
        const element = getElement(groupId);
        const members = [...(groups.get(groupId) ?? [])]
            .map(key => rests.get(key))
            .filter((rest): rest is Rest => Boolean(rest));
        overflowing.delete(groupId);
        if (!members.length) groups.delete(groupId);
        if (!element || !members.length) return;

        members.sort((a, b) =>
            Number(b.caseId === followedCase) - Number(a.caseId === followedCase) || (history.sinceOf(a) ?? 0) - (history.sinceOf(b) ?? 0));
        const capacity = slotCapacity(element);
        const fits = members.length <= capacity;
        const hideAll = !fits && members[0].place.kind === "working";
        const visible = Math.min(members.length, capacity);
        if (!fits) overflowing.set(groupId, members[0].place);
        members.forEach((rest, index) => {
            const token = tokens[rest.caseId]?.[rest.tokenId];
            if (!token) return;
            setTokenPosition(token, slotPosition(element, Math.min(index, visible - 1), visible));
            token.style.visibility = rest.caseId === followedCase || (!hideAll && index < capacity) ? "" : "hidden";
        });
    }

    function flushLayout() {
        layoutScheduled = false;
        dirtyGroups.forEach(layoutGroup);
        dirtyGroups.clear();
        onLayout();
    }

    function hasTokens(caseId: number) {
        return Boolean(tokens[caseId] && Object.keys(tokens[caseId]).length);
    }

    function createToken(
        activeElementId: string,
        caseId: number,
        tokenId: string,
        {show = true, fadeIn = false, rest = false}: {show?: boolean; fadeIn?: boolean; rest?: boolean} = {},
    ): Token | undefined {
        if (!tokens[caseId]) tokens[caseId] = {};
        const activeElement = getElement(activeElementId);
        if (!activeElement) return undefined;

        let point: Waypoint;
        if (activeElement.type === FlowTypes.FLOW) {
            const waypoints = activeElement.waypoints;
            if (!waypoints?.length) return undefined;
            point = waypoints[waypoints.length - 1];
        } else point = calculateCenterPoint(activeElement);

        const token = document.createElementNS(SVG_NS, "circle");
        token.setAttribute("r", DOT_RADIUS.toString());
        token.setAttribute("data-case", caseId.toString());
        token.setAttribute("data-token", tokenId);
        token.classList.add("token");
        if (caseId === followedCase) token.classList.add("followed");
        setTokenPosition(token, point);
        tokens[caseId][tokenId] = token;

        if (show) {
            if (fadeIn) {
                token.style.animationDuration = `2s`;
                token.classList.add("fade-in");
                token.addEventListener("animationend", () => {
                    token.classList.remove("fade-in");
                });
            }
            tokenLayer.appendChild(token);
        }

        if (rest) settle(caseId, tokenId, activeElementId);
        else paintToken(caseId, tokenId);
        return token;
    }

    function deleteToken(caseId: number, tokenId: string, fadeOut: boolean = false) {
        const token = tokens[caseId]?.[tokenId];
        if (!token) return;
        const key = tokenKey(caseId, tokenId);
        removeRest(key);
        animating.delete(key);

        function processDeletion() {
            token.remove();
            if (tokens[caseId]?.[tokenId] === token) delete tokens[caseId][tokenId];
        }

        if (fadeOut) {
            token.style.animationDuration = `2s`;
            token.classList.add("fade-out");
            token.addEventListener("animationend", processDeletion);
        } else processDeletion();
    }

    function clearTokens() {
        tokenLayer?.replaceChildren();
        tokens = {};
        rests.clear();
        groups.clear();
        animating.clear();
        taskCounts.clear();
        dirtyGroups.clear();
        overflowing.clear();
        onLayout();
    }

    function reconcileWithFrames(frames: FrameCase[]) {
        const active = new Map(frames.map(frame => [frame.caseId, frame.activeElements]));

        Object.entries(tokens).forEach(([caseIdKey, caseTokens]) => {
            const caseId = Number(caseIdKey);
            const elements = active.get(caseId);
            Object.entries(caseTokens).forEach(([tokenId, token]) => {
                if (token.classList.contains("fade-out")) return;
                if (!elements || !(tokenId in elements)) deleteToken(caseId, tokenId);
            });
            if (!Object.keys(caseTokens).length) delete tokens[caseId];
        });

        active.forEach((elements, caseId) => {
            Object.entries(elements).forEach(([tokenId, elementId]) => {
                const token = tokens[caseId]?.[tokenId];
                if (!token) {
                    createToken(elementId, caseId, tokenId, {rest: true});
                    return;
                }
                if (!token.isConnected) tokenLayer.appendChild(token);
                const key = tokenKey(caseId, tokenId);
                if (!animating.has(key) && rests.get(key)?.elementId !== elementId) settle(caseId, tokenId, elementId);
            });
        });
        flushLayout();
    }

    function setColorMode(mode: ColorMode) {
        colorMode = mode;
        paintAllTokens();
        if (agePaintInterval) clearInterval(agePaintInterval);
        agePaintInterval = mode === "age" ? setInterval(paintAllTokens, 1000) : null;
    }

    function setFollowedCase(caseId: number | null) {
        const previous = followedCase;
        followedCase = caseId;
        [previous, caseId].forEach(id => {
            if (id === null) return;
            Object.values(tokens[id] ?? {}).forEach(token => {
                token.classList.toggle("followed", id === followedCase);
                if (token.isConnected) tokenLayer.appendChild(token);
            });
        });
        rests.forEach(rest => {
            if (rest.caseId === previous || rest.caseId === caseId) markDirty(rest.place.groupId);
        });
    }

    function getTaskQueue(taskId: string): QueueEntry[] {
        const entries: QueueEntry[] = [];
        rests.forEach(rest => {
            if (rest.place.taskId !== taskId || (rest.place.kind !== "waiting" && rest.place.kind !== "working")) return;
            entries.push({
                caseId: rest.caseId,
                state: rest.place.kind,
                since: history.sinceOf(rest),
                arrival: history.arrivalOf(rest.caseId),
            });
        });
        return entries.sort((a, b) =>
            a.state === b.state ? (a.since ?? 0) - (b.since ?? 0) : a.state === "waiting" ? -1 : 1);
    }

    return {
        rests,
        animating,
        overflowing,
        attach: (layer: SVGGElement) => { tokenLayer = layer; },
        reveal: (token: Token) => { tokenLayer.appendChild(token); },
        tokenOf: (caseId: number, tokenId: string): Token | undefined => tokens[caseId]?.[tokenId],
        tokenIdsOf: (caseId: number) => Object.keys(tokens[caseId] ?? {}),
        taskLoad: (): TaskLoad => Object.fromEntries([...taskCounts].map(([taskId, counts]) => [taskId, {...counts}])),
        isFollowed: (caseId: number) => caseId === followedCase,
        colorMode: () => colorMode,
        stop: () => { if (agePaintInterval) clearInterval(agePaintInterval); },
        hasTokens,
        createToken,
        deleteToken,
        clearTokens,
        settle,
        unsettle,
        reconcileWithFrames,
        setColorMode,
        setFollowedCase,
        getTaskQueue,
    };
}
