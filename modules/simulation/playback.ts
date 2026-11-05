import axios from "axios";
import {Dispatch, SetStateAction} from "react";
import {Flow, Node} from "@definitions/simulation/interfaces";
import {Batch, FrameCase, InitialView, SimulationHooks, WTPTState} from "@definitions/simulation/types";
import {SimulationData} from "@definitions/api/types";
import {formatInLogTime, formatUtcOffset} from "@utils/dateHelpers";
import {toUtcMs} from "@utils/processAnalysis";
import {CaseHistory} from "@modules/simulation/caseHistory";
import {SimulationClock} from "@modules/simulation/clock";
import {Dots} from "@modules/simulation/dotLayout";
import {applyBatchFrameUpdates} from "@modules/simulation/frameUpdateHelpers";
import {
    calculatePlaybackDelta,
    decidePlaybackSpeedUpdateAction,
    decidePlayPauseResumeAction,
} from "@modules/simulation/playbackStateHelpers";
import {computeProportionalDelta, groupEventsByCaseId, shouldTopUpQueue} from "@modules/simulation/runSimulationHelpers";
import {
    batchFetchLimit,
    batchTopUpThreshold,
    DEFAULT_HOURS_PER_SECOND,
    isSummarySpeed,
    msPerSimulatedHour,
} from "@modules/simulation/speed";
import {buildResumedWTPT, buildTimelineResumptionPatch} from "@modules/simulation/timelineResumptionHelpers";
import {createTokenAnimation, PlaybackSession} from "@modules/simulation/tokenAnimation";

const HOUR = 3600000;

type Options = {
    simulationData: SimulationData;
    caseNumberSetter: Dispatch<SetStateAction<{ongoing: number; finished: number}>>;
    wtptSetter: Dispatch<SetStateAction<WTPTState>>;
    hooks: SimulationHooks;
    initialView: InitialView;
    getElement: (elementId: string) => Flow | Node | undefined;
    clock: SimulationClock;
    dots: Dots;
    history: CaseHistory;
};

export function createPlayback({simulationData, caseNumberSetter, wtptSetter, hooks, initialView, getElement, clock, dots, history}: Options) {
    const processId = simulationData.processId;
    const defaultDelta = msPerSimulatedHour(1);
    let delta = msPerSimulatedHour(initialView.hoursPerSecond ?? DEFAULT_HOURS_PER_SECOND);
    const totalDuration = clock.final.getTime() - clock.initial.getTime();
    const timeline = document.getElementById('timeline');
    const progressBar = document.getElementById('progress-bar');
    const pointer = document.getElementById('pointer');
    const tooltip = document.getElementById('timeline-tooltip');
    const ctTimeBar = document.getElementById('cycle-time-chart-time-bar');
    const currentDateTimeBox = document.getElementById('simulated-time-box');
    const playPauseButton = document.getElementById('play-pause-btn');
    let currentProgress: number = 0.0;
    let batchesQueue: Batch[] = simulationData.batches;
    let currentBatch: Batch;
    let currentBatchUnfinished = false;
    let frames: FrameCase[] = [...simulationData.frames];
    let batchesPointer = simulationData.pointer;
    let isPaused = false;
    let fetchPromise: Promise<void> | null = null;
    let queueGeneration = 0;
    let hasEnded = false;
    let openingMoment = false;

    const session: PlaybackSession = {
        abortController: new AbortController(),
        isResumed: false,
        localProgress: 0.0,
        tokenProgresses: {},
    };
    const {handleBatchEvents} = createTokenAnimation({getElement, dots, session});

    function formatTime(date: Date) {
        return formatInLogTime(date, clock.utcOffset);
    }

    function showCurrentTime(progress: number) {
        clock.current = new Date(clock.initial.getTime() + progress * totalDuration);
        currentDateTimeBox.textContent = `${formatTime(clock.current)} ${formatUtcOffset(clock.utcOffset)}`;
    }

    function showProgress(progress: number) {
        const progressPercentage = `${progress * 100}%`;
        progressBar.style.width = progressPercentage;
        pointer.style.left = progressPercentage;
        ctTimeBar.style.width = `calc((100% - 24px) * ${progress})`;
        showCurrentTime(progress);
    }

    function enableTimeline() {
        const startDate = document.getElementById("start-date");
        startDate.textContent = formatTime(clock.initial);
        const endDate = document.getElementById("end-date");
        endDate.textContent = formatTime(clock.final);

        const goToStartButton = document.getElementById('go-to-start-btn');
        goToStartButton.addEventListener("click", () => handleRewindButtonClick(0));
        playPauseButton.addEventListener("click", handlePlayPause);
        const goToEndButton = document.getElementById("go-to-end-btn");
        goToEndButton.addEventListener("click", () => handleRewindButtonClick(100));

        const speedSelect = document.getElementById("speed-select");
        speedSelect.addEventListener("change", (event) => {
            const newSpeed = parseFloat((event.target as HTMLSelectElement).value);
            updatePlaybackSpeed(newSpeed);
        });

        enableTimelineDragging();
        enableTimelineHover();
    }

    function animateTimeline(batchDuration: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const signal = session.abortController.signal;
            let startTime = performance.now();
            if (session.isResumed && session.localProgress) {
                const proportionalDelta = delta * batchDuration / HOUR;
                startTime -= session.localProgress * proportionalDelta;
            }

            function animate() {
                if (signal.aborted) {
                    reject(new Error("Simulation aborted"));
                    return;
                }

                const elapsedTime = Math.min((performance.now() - startTime) / delta * HOUR, batchDuration);
                const progress = Math.min(currentProgress + elapsedTime / totalDuration, 1);
                const innerProgress = batchDuration > 0 ? elapsedTime / batchDuration : 1;

                showProgress(progress);

                if (innerProgress < 1) {
                    session.localProgress = innerProgress;
                    requestAnimationFrame(animate);
                } else {
                    currentProgress = progress;
                    session.localProgress = 0.0;
                    resolve();
                }
            }

            requestAnimationFrame(animate);
        });
    }

    function enableTimelineDragging() {
        let isDragging = false;

        function updateProgress(event: MouseEvent | TouchEvent) {
            if (!isDragging) return;

            const rect = timeline.getBoundingClientRect();
            const clientX = event instanceof MouseEvent ? event.clientX : event.touches[0].clientX;
            const progress = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));

            currentProgress = progress / 100;
            showProgress(currentProgress);
        }

        function handleDragStart(event: MouseEvent | TouchEvent) {
            isDragging = true;
            session.abortController.abort();
            updateProgress(event);
        }

        async function handleDragEnd(event: MouseEvent | TouchEvent) {
            if (!isDragging) return;
            isDragging = false;

            const rect = timeline.getBoundingClientRect();
            const clientX = event instanceof MouseEvent ? event.clientX : event.changedTouches[0].clientX;
            const progress = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));

            await handleTimelineRequest(progress);
        }

        timeline.addEventListener("mousedown", handleDragStart);
        timeline.addEventListener("touchstart", handleDragStart);
        document.addEventListener("mousemove", updateProgress);
        document.addEventListener("touchmove", updateProgress);
        document.addEventListener("mouseup", handleDragEnd);
        document.addEventListener("touchend", handleDragEnd);
    }

    function enableTimelineHover() {
        function updateTooltip(event: MouseEvent) {
            const rect = timeline.getBoundingClientRect();
            const progress = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
            const moment = new Date(clock.initial.getTime() + (progress / 100) * totalDuration);
            const extra = hooks.describeMoment?.(moment.getTime());

            tooltip.textContent = extra ? `${formatTime(moment)} · ${extra}` : formatTime(moment);
            tooltip.style.left = `${event.clientX + 10}px`;
            tooltip.style.top = `${event.clientY - 30}px`;
            tooltip.style.display = "block";
        }

        function hideTooltip() {
            tooltip.style.display = "none";
        }

        timeline.addEventListener("mousemove", updateTooltip);
        timeline.addEventListener("mouseleave", hideTooltip);
    }

    function handleRewindButtonClick(progress: number) {
        session.abortController.abort();

        currentProgress = progress / 100;
        showProgress(currentProgress);

        handleTimelineRequest(progress);
    }

    function finishPlayback() {
        playPauseButton.innerHTML = " ▶";
        isPaused = true;
        hasEnded = true;
        hooks.onViewChange?.();
    }

    function handlePlayPause() {
        if (openingMoment) return;

        const action = decidePlayPauseResumeAction({
            isPaused,
            hasEnded,
            batchesQueue,
            currentBatch,
            localProgress: session.localProgress,
            currentBatchUnfinished,
        });

        if (action.kind === "pause") {
            playPauseButton.innerHTML = " ▶";
            isPaused = true;
            session.abortController.abort();
            hooks.onViewChange?.();
            return;
        }

        if (action.kind === "restart") {
            hasEnded = false;
            currentProgress = 0.0;
            showCurrentTime(0);
            handleTimelineRequest(0);
            return;
        }

        batchesQueue = action.nextQueue;
        currentBatchUnfinished = false;
        playPauseButton.innerHTML = "⏸";
        isPaused = false;
        session.isResumed = action.resetPatch.isResumed;
        session.abortController = new AbortController();
        restartFromFrames();
    }

    function restartFromFrames() {
        setTimeout(() => {
            dots.clearTokens();
            runSimulation();
        }, 10);
    }

    function updatePlaybackSpeed(newSpeed: number) {
        const action = decidePlaybackSpeedUpdateAction({
            isPaused,
            batchesQueue,
            currentBatch,
            localProgress: session.localProgress,
            currentBatchUnfinished,
        });

        if (action.kind === "running") {
            session.abortController.abort();

            setTimeout(() => {
                batchesQueue = action.nextQueue;
                currentBatchUnfinished = false;
                session.isResumed = action.resetPatch.isResumed;
                delta = calculatePlaybackDelta(defaultDelta, newSpeed);
                session.abortController = new AbortController();
                restartFromFrames();
            }, 300);
        } else {
            delta = calculatePlaybackDelta(defaultDelta, newSpeed);
        }
    }

    function openAtMoment(moment: number) {
        currentProgress = totalDuration ? Math.max(0, Math.min(1, (moment - clock.initial.getTime()) / totalDuration)) : 0;
        isPaused = true;
        playPauseButton.innerHTML = " ▶";
        showProgress(currentProgress);
        openingMoment = true;
        handleTimelineRequest(currentProgress * 100, true).finally(() => { openingMoment = false; });
    }

    async function handleTimelineRequest(progress: number, stayPaused = false) {
        try {
            const res = await axios.post(`/api/simulation/${processId}/resumption`, {
                requestedDate: new Date(clock.initial.getTime() + (progress / 100) * totalDuration).toISOString(),
            });

            const patch = buildTimelineResumptionPatch(res.data, isPaused && !stayPaused);

            queueGeneration++;
            session.tokenProgresses = patch.tokenProgresses;
            session.localProgress = patch.localProgress;
            batchesQueue = patch.batchesQueue;
            currentBatchUnfinished = false;
            frames = patch.frames;
            batchesPointer = patch.batchesPointer;
            history.seedTaskTimes(res.data.wtpt);

            caseNumberSetter(patch.caseNumbers);

            wtptSetter(prev => buildResumedWTPT(prev, res.data.wtpt));

            if (patch.shouldUnpause) {
                isPaused = false;
                playPauseButton.innerHTML = "⏸";
            }
            hasEnded = stayPaused && progress >= 100;
            session.abortController = new AbortController();
            if (stayPaused) {
                dots.clearTokens();
                dots.reconcileWithFrames(frames);
            } else restartFromFrames();
            hooks.onViewChange?.();
        } catch (error) {
            console.log(error);
            if (stayPaused) {
                currentProgress = 0;
                showProgress(0);
                dots.reconcileWithFrames(frames);
                hooks.onOpenFailed?.();
            }
        }
    }

    function topBatchesQueueUp(): Promise<void> {
        if (fetchPromise) return fetchPromise;
        const generation = queueGeneration;

        fetchPromise = (async () => {
            try {
                const res = await axios.get(`/api/simulation/${processId}/polling?pointer=${batchesPointer}&limit=${batchFetchLimit(delta)}`);
                if (generation !== queueGeneration) return;
                batchesQueue.push(...res.data.batches);
                batchesPointer = res.data.pointer;
            } catch (error) {
                console.log(error);
            } finally {
                fetchPromise = null;
            }
        })();
        return fetchPromise;
    }

    function topUpIfNeeded() {
        if (shouldTopUpQueue(batchesQueue.length, batchesPointer, batchTopUpThreshold(delta))) {
            topBatchesQueueUp();
        }
    }

    async function waitForBatches(signal: AbortSignal): Promise<boolean> {
        while (!batchesQueue.length && batchesPointer > 0) {
            await topBatchesQueueUp();
            if (signal.aborted) return false;
            if (!batchesQueue.length) await new Promise(resolve => setTimeout(resolve, 1000));
            if (signal.aborted) return false;
        }
        return batchesQueue.length > 0;
    }

    function applyBatch(batch: Batch) {
        frames = applyBatchFrameUpdates({
            frames,
            batch,
            getNodeType: elementId => getElement(elementId)?.type,
            caseNumberSetter,
            wtptSetter,
        });
    }

    function runSimulation() {
        return isSummarySpeed(delta) ? runSummary() : runAnimated();
    }

    async function runAnimated() {
        const signal = session.abortController.signal;
        dots.reconcileWithFrames(frames);

        while (true) {
            if (signal.aborted) return;
            if (!batchesQueue.length && !(await waitForBatches(signal))) break;
            if (signal.aborted) return;

            currentBatch = batchesQueue.shift()!;
            currentBatchUnfinished = true;
            topUpIfNeeded();

            const batchDuration = toUtcMs(currentBatch.endDate) - toUtcMs(currentBatch.startDate);
            const proportionalDelta = computeProportionalDelta(delta, batchDuration);
            history.noteBatchEvents(currentBatch.events);

            const eventsByCaseId = groupEventsByCaseId(currentBatch.events);
            await Promise.allSettled([
                animateTimeline(batchDuration),
                ...Object.entries(eventsByCaseId).map(([caseId, batchEvents]) =>
                    handleBatchEvents({
                        caseId: parseInt(caseId),
                        batchEvents,
                        batchDuration: proportionalDelta,
                    })
                ),
            ]);
            if (signal.aborted) return;

            applyBatch(currentBatch);
            currentBatchUnfinished = false;
            dots.reconcileWithFrames(frames);
            if (session.isResumed) session.isResumed = false;
        }

        finishPlayback();
    }

    function runSummary(): Promise<void> {
        const signal = session.abortController.signal;
        const initialMs = clock.initial.getTime();
        const finalMs = clock.final.getTime();
        let simulatedMs = initialMs + currentProgress * totalDuration;
        let appliedUntil = simulatedMs;
        let last = performance.now();
        let waiting = false;

        session.localProgress = 0;
        session.isResumed = false;
        dots.reconcileWithFrames(frames);

        return new Promise(resolve => {
            const step = (timestamp: number) => {
                if (signal.aborted) {
                    currentProgress = Math.min(Math.max((appliedUntil - initialMs) / totalDuration, 0), 1);
                    showProgress(currentProgress);
                    hooks.onViewChange?.();
                    resolve();
                    return;
                }

                const elapsed = Math.max(0, timestamp - last);
                last = timestamp;
                let target = Math.min(simulatedMs + elapsed / delta * HOUR, finalMs);
                const applyUntil = target >= finalMs ? Infinity : target;
                let applied = false;

                while (batchesQueue.length && toUtcMs(batchesQueue[0].endDate) <= applyUntil) {
                    currentBatch = batchesQueue.shift()!;
                    history.noteBatchEvents(currentBatch.events);
                    applyBatch(currentBatch);
                    appliedUntil = toUtcMs(currentBatch.endDate);
                    applied = true;
                }
                if (applied) dots.reconcileWithFrames(frames);
                topUpIfNeeded();

                const moreToLoad = batchesPointer > 0;
                if (!batchesQueue.length && moreToLoad) {
                    target = Math.min(target, appliedUntil);
                    if (!waiting) {
                        waiting = true;
                        topBatchesQueueUp().finally(() => { waiting = false; });
                    }
                }

                simulatedMs = Math.max(simulatedMs, target);
                currentProgress = totalDuration ? Math.min((simulatedMs - initialMs) / totalDuration, 1) : 1;
                showProgress(currentProgress);

                if (!batchesQueue.length && !moreToLoad && simulatedMs >= Math.min(finalMs, appliedUntil)) {
                    currentProgress = 1;
                    showProgress(1);
                    finishPlayback();
                    resolve();
                    return;
                }
                requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        });
    }

    function start() {
        showCurrentTime(0);
        enableTimeline();
        if (initialView.moment !== undefined) openAtMoment(initialView.moment);
        else runSimulation();
    }

    return {
        start,
        stop: () => session.abortController.abort(),
    };
}
