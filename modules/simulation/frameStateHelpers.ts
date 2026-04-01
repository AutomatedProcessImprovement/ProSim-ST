import {LifecycleTypes, NodeTypes} from "@definitions/simulation/enums";
import {BatchEvent, FrameCase} from "@definitions/simulation/types";

type CaseCountersDelta = {
    ongoing: number;
    finished: number;
};

type ApplyEventResult = {
    frames: FrameCase[];
    countersDelta: CaseCountersDelta;
};

type NodeTypeResolver = (elementId: string) => string | undefined;

function cloneFrames(frames: FrameCase[]): FrameCase[] {
    return frames.map((frame) => ({
        ...frame,
        activeElements: {...frame.activeElements},
    }));
}

export function applyEventToFrames(
    frames: FrameCase[],
    event: BatchEvent,
    getNodeType: NodeTypeResolver,
): ApplyEventResult {
    const nextFrames = cloneFrames(frames);
    const countersDelta: CaseCountersDelta = {ongoing: 0, finished: 0};
    const paths = event.paths;
    const numberOfTokens = Object.keys(paths).length;

    if (numberOfTokens === 1) {
        Object.entries(paths).forEach(([tokenId, path]) => {
            const destination = path[path.length - 1];

            switch (event.lifecycle) {
                case LifecycleTypes.CASE_ARRIVAL:
                    nextFrames.push({
                        caseId: event.caseId,
                        activeElements: {
                            [tokenId]: destination,
                        },
                    });
                    countersDelta.ongoing += 1;
                    break;
                case LifecycleTypes.START:
                case LifecycleTypes.COMPLETE:
                case LifecycleTypes.ENABLE: {
                    const eventCase = nextFrames.find((frame) => frame.caseId === event.caseId);
                    if (eventCase) eventCase.activeElements[tokenId] = destination;
                    break;
                }
                case LifecycleTypes.CASE_END:
                    for (let i = nextFrames.length - 1; i >= 0; i--) {
                        if (nextFrames[i].caseId === event.caseId) nextFrames.splice(i, 1);
                    }
                    countersDelta.ongoing -= 1;
                    countersDelta.finished += 1;
                    break;
            }
        });

        return {frames: nextFrames, countersDelta};
    }

    if (numberOfTokens > 1) {
        Object.entries(paths).forEach(([tokenId, path]) => {
            const eventCase = nextFrames.find((frame) => frame.caseId === event.caseId);
            if (!eventCase) return;

            const source = path[0];
            const destination = path[path.length - 1];
            const destinationType = getNodeType(destination);
            const sourceType = getNodeType(source);

            if (destinationType === NodeTypes.PARALLEL_GATEWAY) {
                if (eventCase.activeElements[tokenId]) delete eventCase.activeElements[tokenId];
            } else if (sourceType === NodeTypes.PARALLEL_GATEWAY) {
                eventCase.activeElements[tokenId] = destination;
            }
        });
    }

    return {frames: nextFrames, countersDelta};
}

