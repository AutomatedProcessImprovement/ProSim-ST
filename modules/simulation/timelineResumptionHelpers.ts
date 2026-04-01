import {ResumeSimulationResponse} from "@definitions/api/types";
import {TokenProgresses, WTPTState} from "@definitions/simulation/types";
import {hydrateWTPTNames} from "@modules/simulation/wtptHelpers";

export type TimelineResumptionPatch = {
    tokenProgresses: TokenProgresses;
    localProgress: number;
    batchesQueue: ResumeSimulationResponse["batches"];
    frames: ResumeSimulationResponse["frames"];
    batchesPointer: number;
    caseNumbers: {
        ongoing: number;
        finished: number;
    };
    shouldUnpause: boolean;
};

export function buildTimelineResumptionPatch(
    response: ResumeSimulationResponse,
    isPaused: boolean,
): TimelineResumptionPatch {
    return {
        tokenProgresses: {},
        localProgress: 0.0,
        batchesQueue: response.batches,
        frames: [...response.frames],
        batchesPointer: response.pointer,
        caseNumbers: {
            ongoing: response.frames.length,
            finished: response.finishedCasesNumber,
        },
        shouldUnpause: isPaused,
    };
}

export function buildResumedWTPT(currentWTPT: WTPTState, incomingWTPT: WTPTState): WTPTState {
    return hydrateWTPTNames(currentWTPT, incomingWTPT);
}


