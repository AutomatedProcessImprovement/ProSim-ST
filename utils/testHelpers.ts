import {Event} from "@db/entities/Event";
import {LifecycleTypes} from "@definitions/simulation/enums";

export const makeEvent = (
    overrides: Pick<Event, "caseId" | "lifecycle" | "timestamp"> & Partial<Event>
): Event => ({
    id: 0,
    nodeId: "",
    paths: {},
    process: null,
    processId: "",
    ...overrides,
} as Event);

export const makeEventWith = (
    caseId: number,
    lifecycle: LifecycleTypes,
    timestamp: string,
): Event => makeEvent({ caseId, lifecycle, timestamp });

