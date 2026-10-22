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

// Applies a batch to the cases' positions, and updates the case counters and waiting/processing times once for the
// whole batch (fast playback goes through hundreds of batches a second)
export function applyBatchFrameUpdates(input: ApplyBatchFrameUpdatesInput): FrameCase[] {
    let nextFrames = input.frames;
    const counters = {ongoing: 0, finished: 0};

    input.batch.events.forEach((event) => {
        const {frames: updatedFrames, countersDelta} = applyEventToFrames(
            nextFrames,
            event,
            input.getNodeType,
        );
        nextFrames = updatedFrames;
        counters.ongoing += countersDelta.ongoing;
        counters.finished += countersDelta.finished;
    });

    if (counters.ongoing || counters.finished) {
        input.caseNumberSetter((state) => ({
            ongoing: state.ongoing + counters.ongoing,
            finished: state.finished + counters.finished,
        }));
    }

    if (input.batch.events.length) {
        input.wtptSetter((prev) => input.batch.events.reduce(setNewWTPTState, prev));
    }

    return nextFrames;
}
