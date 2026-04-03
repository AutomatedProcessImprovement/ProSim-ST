import {Dispatch, SetStateAction} from "react";
import {Batch, FrameCase, WTPTState} from "@definitions/simulation/types";
import {applyEventToFrames} from "@modules/simulation/frameStateHelpers";
import {setNewWTPTState} from "@modules/simulation/wtptHelpers";

type CaseNumberSetter = Dispatch<SetStateAction<{ ongoing: number; finished: number }>>;
type WtptSetter = Dispatch<SetStateAction<WTPTState>>;

type ApplyBatchFrameUpdatesInput = {
    frames: FrameCase[];
    batch: Batch;
    getNodeType: (elementId: string) => string | undefined;
    caseNumberSetter: CaseNumberSetter;
    wtptSetter: WtptSetter;
};

export function applyBatchFrameUpdates(input: ApplyBatchFrameUpdatesInput): FrameCase[] {
    let nextFrames = input.frames;

    input.batch.events.forEach((event) => {
        const {frames: updatedFrames, countersDelta} = applyEventToFrames(
            nextFrames,
            event,
            input.getNodeType,
        );
        nextFrames = updatedFrames;

        if (countersDelta.ongoing || countersDelta.finished) {
            input.caseNumberSetter((state) => ({
                ongoing: state.ongoing + countersDelta.ongoing,
                finished: state.finished + countersDelta.finished,
            }));
        }

        input.wtptSetter((prev) => setNewWTPTState(prev, event));
    });

    return nextFrames;
}

type ApplyBatchFrameUpdatesIfNeededInput = ApplyBatchFrameUpdatesInput & {
    shouldApply: boolean;
};

export function applyBatchFrameUpdatesIfNeeded(input: ApplyBatchFrameUpdatesIfNeededInput): FrameCase[] {
    if (!input.shouldApply) return input.frames;

    return applyBatchFrameUpdates(input);
}

