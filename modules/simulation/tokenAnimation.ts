import {Flow, Node, Waypoint} from "@definitions/simulation/interfaces";
import {AnimationData, BatchEvent, PathMap, TokenProgresses} from "@definitions/simulation/types";
import {FlowTypes, LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";
import {calculateCenterPoint, Dots, getTokenCoordinates, tokenKey} from "@modules/simulation/dotLayout";
import {buildPathMap, calculateDurations, calculatePathLength} from "@modules/simulation/pathDurationHelpers";
import {computeTokenAnimationStartTime} from "@modules/simulation/runSimulationHelpers";

export type PlaybackSession = {
    abortController: AbortController;
    isResumed: boolean;
    localProgress: number;
    tokenProgresses: TokenProgresses;
};

type AnimationTracker = {
    start: () => void;
    done: () => void;
};

type Options = {
    getElement: (elementId: string) => Flow | Node | undefined;
    dots: Dots;
    session: PlaybackSession;
};

export function createTokenAnimation({getElement, dots, session}: Options) {
    function handleBatchEvents({caseId, batchEvents, batchDuration}: { caseId: number; batchEvents: Array<BatchEvent>; batchDuration: number }): Promise<void> {
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
            caseId: number,
            elements: Array<string>,
            batchEventPathEntries: Array<[string, Array<string>]>
        ): { path: Array<Waypoint>, nextTokenIds: Array<string> } {
            let path: Array<Waypoint> = [];
            let nextTokenIds: Array<string> = [];

            if (!animationData[tokenId]) path.push(getTokenCoordinates(dots.tokenOf(caseId, tokenId)));
            elements.forEach((elementId, index) => {
                const element = getElement(elementId);
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
                            // eslint-disable-next-line @typescript-eslint/no-unused-vars
                            .map(([otherTokenId, _]) => otherTokenId);
                    }
                }
            });

            return { path, nextTokenIds };
        }

        return new Promise((resolve: () => void, reject) => {
            session.abortController.signal.addEventListener("abort", () => {
                reject(new Error("Simulation aborted"));
            });

            let pending = 0;
            const tracker: AnimationTracker = {
                start: () => { pending++; },
                done: () => { if (--pending === 0) resolve(); },
            };

            const animationData: AnimationData = {};
            const finalElements: Record<string, string> = {};
            const isAsyncAnimation = batchEvents.some(batchEvent => Object.keys(batchEvent.paths).length > 1)

            const finishToken = (tokenId: string, lifecycle: LifecycleTypes) => {
                const finalElement = finalElements[tokenId];
                if (lifecycle === LifecycleTypes.CASE_END) dots.deleteToken(caseId, tokenId, true);
                else if (isAsyncAnimation && getElement(finalElement)?.type === NodeTypes.PARALLEL_GATEWAY) dots.deleteToken(caseId, tokenId);
                else dots.settle(caseId, tokenId, finalElement);
            };

            const addToAnimation = (batchEvent: BatchEvent, tokenId: string, elements: string[], entries: Array<[string, Array<string>]>) => {
                if (!dots.tokenOf(caseId, tokenId) || !elements.length) return;
                const {path, nextTokenIds} = addElementsToPath(animationData, tokenId, caseId, elements, entries);
                animationData[tokenId] = animationData[tokenId]
                    ? {path: [...animationData[tokenId].path, ...path], nextTokenIds}
                    : {path, nextTokenIds};
                animationData[tokenId].onComplete = () => finishToken(tokenId, batchEvent.lifecycle);
                finalElements[tokenId] = elements[elements.length - 1];
            };

            batchEvents.forEach(batchEvent => {
                const batchEventPathEntries = Object.entries(batchEvent.paths);
                if (isAsyncAnimation) {
                    batchEventPathEntries.forEach(([tokenId, elements]) => {
                        if (!dots.tokenOf(caseId, tokenId)) {
                            const show = !dots.hasTokens(caseId);
                            dots.createToken(elements[0], caseId, tokenId, {
                                show,
                                fadeIn: show && (!session.isResumed || !session.tokenProgresses[caseId]?.[tokenId]),
                            });
                        }
                        addToAnimation(batchEvent, tokenId, elements, batchEventPathEntries);
                    });
                } else if (batchEventPathEntries.length) {
                    const [tokenId, elements] = batchEventPathEntries[0];
                    if (!dots.tokenOf(caseId, tokenId)) {
                        dots.createToken(elements[0], caseId, tokenId, {fadeIn: !session.isResumed || !session.tokenProgresses[caseId]?.[tokenId]});
                    }
                    addToAnimation(batchEvent, tokenId, elements, batchEventPathEntries);
                }
            });

            if (isAsyncAnimation) animateAsyncData(buildPathMap(animationData), caseId, batchDuration, false, new Set(), tracker);
            else Object.entries(animationData).forEach(([tokenId, {path, onComplete}]) => {
                animateToken(path, onComplete, caseId, tokenId, batchDuration, tracker);
            });

            if (pending === 0) setTimeout(resolve, batchDuration * (1 - (session.isResumed ? session.localProgress : 0)));
            else setTimeout(resolve, batchDuration * 2 + 1000);
        });
    }

    function animateAsyncData(pathMap: PathMap, caseId: number, remainingDuration: number, isHidden: boolean, animatedTokens: Set<string>, tracker: AnimationTracker) {
        const durations = calculateDurations(pathMap, animatedTokens, remainingDuration);

        Object.entries(pathMap).forEach(([tokenId, tokenData]) => {
            if (animatedTokens.has(tokenId)) return;

            const token = dots.tokenOf(caseId, tokenId);
            if (!token) return;
            if (isHidden || !token.isConnected) dots.reveal(token);
            const duration = durations[tokenId];
            const onComplete = () => {
                if (Object.keys(tokenData.subPaths).length) {
                    dots.deleteToken(caseId, tokenId);
                    animateAsyncData(tokenData.subPaths, caseId, remainingDuration - duration, true, animatedTokens, tracker);
                } else {
                    tokenData.onComplete();
                }
            }
            animatedTokens.add(tokenId);
            animateToken(tokenData.path, onComplete, caseId, tokenId, duration, tracker);
        });
    }

    function animateToken(path: Waypoint[], onComplete: () => void, caseId: number, tokenId: string, duration: number, tracker: AnimationTracker) {
        const key = tokenKey(caseId, tokenId);
        tracker.start();
        dots.animating.add(key);
        dots.unsettle(caseId, tokenId);

        const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
        const startTime = computeTokenAnimationStartTime(
            performance.now(),
            safeDuration,
            session.isResumed,
            session.tokenProgresses[caseId]?.[tokenId],
        );
        const pathLength = calculatePathLength(path);
        const signal = session.abortController.signal;

        function animate() {
            if (signal.aborted) return;
            const token = dots.tokenOf(caseId, tokenId);

            const elapsedTime = performance.now() - startTime;
            const progress = safeDuration > 0 ? Math.min(elapsedTime / safeDuration, 1) : 1;
            const currentDistance = progress * pathLength;

            let accumulatedDistance = 0;
            for (let i = 0; token && i < path.length - 1; i++) {
                const segmentStart = path[i];
                const segmentEnd = path[i + 1];
                const dx = segmentEnd.x - segmentStart.x;
                const dy = segmentEnd.y - segmentStart.y;
                const segmentLength = Math.sqrt(dx * dx + dy * dy);

                if (accumulatedDistance + segmentLength >= currentDistance) {
                    const segmentProgress = segmentLength ? (currentDistance - accumulatedDistance) / segmentLength : 1;
                    token.setAttribute("cx", (segmentStart.x + dx * segmentProgress).toString());
                    token.setAttribute("cy", (segmentStart.y + dy * segmentProgress).toString());
                    break;
                }

                accumulatedDistance += segmentLength;
            }

            if (!session.tokenProgresses[caseId]) session.tokenProgresses[caseId] = {};
            session.tokenProgresses[caseId][tokenId] = progress;

            if (progress < 1) requestAnimationFrame(animate);
            else {
                dots.animating.delete(key);
                onComplete();
                tracker.done();
            }
        }

        requestAnimationFrame(animate);
    }

    return {handleBatchEvents};
}
