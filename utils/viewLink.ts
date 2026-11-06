import {ColorMode} from "@definitions/simulation/types";
import {DEFAULT_HOURS_PER_SECOND, SPEEDS} from "@modules/simulation/speed";

export type SharedView = {
    moment?: number;
    hoursPerSecond?: number;
    colorMode?: ColorMode;
    taskId?: string;
    caseId?: number;
};

export const readSharedView = (search: string): SharedView => {
    const params = new URLSearchParams(search);
    const view: SharedView = {};

    const moment = Date.parse(params.get("t") ?? "");
    if (!isNaN(moment)) view.moment = moment;

    const speed = Number(params.get("speed"));
    if (SPEEDS.some(({hoursPerSecond}) => hoursPerSecond === speed)) view.hoursPerSecond = speed;

    const colour = params.get("colour");
    if (colour === "age" || colour === "origin") view.colorMode = colour;

    const task = params.get("task");
    if (task) view.taskId = task;

    const caseId = params.get("case");
    if (caseId && /^\d+$/.test(caseId)) view.caseId = Number(caseId);

    return view;
};

export const writeSharedView = ({moment, hoursPerSecond, colorMode, taskId, caseId}: SharedView): string => {
    const params = new URLSearchParams();
    if (moment !== undefined) params.set("t", new Date(moment).toISOString().slice(0, 19) + "Z");
    if (hoursPerSecond !== undefined && hoursPerSecond !== DEFAULT_HOURS_PER_SECOND) params.set("speed", String(hoursPerSecond));
    if (colorMode && colorMode !== "state") params.set("colour", colorMode);
    if (taskId) params.set("task", taskId);
    if (caseId !== undefined) params.set("case", String(caseId));

    const query = params.toString().replace(/%3A/g, ":");
    return query ? `?${query}` : "";
};
