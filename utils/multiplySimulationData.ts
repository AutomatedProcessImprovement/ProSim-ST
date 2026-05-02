import { Batch, FrameCase } from "@definitions/simulation/types";

const CLONE_OFFSET = 1_000_000;

export function multiplyFrames(frames: FrameCase[], scale: number): FrameCase[] {
    if (scale <= 1) return frames;
    const clones = Array.from({ length: scale - 1 }, (_, k) =>
        frames.map(frame => ({
            caseId: frame.caseId + (k + 1) * CLONE_OFFSET,
            activeElements: { ...frame.activeElements },
        }))
    ).flat();
    return [...frames, ...clones];
}

export function multiplyBatches(batches: Batch[], scale: number): Batch[] {
    if (scale <= 1) return batches;
    return batches.map(batch => ({
        ...batch,
        events: [
            ...batch.events,
            ...Array.from({ length: scale - 1 }, (_, k) =>
                batch.events.map(event => ({
                    ...event,
                    caseId: event.caseId + (k + 1) * CLONE_OFFSET,
                }))
            ).flat(),
        ],
    }));
}