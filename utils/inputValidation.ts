import {splitLogLines} from "@utils/fileHelpers";

export type BpmnSummary = {
    tasks: {id: string; name: string}[];
    startEvents: number;
    endEvents: number;
    divergingGateways: string[];
    unsupported: string[];
    hasDiagram: boolean;
};

export const TASK_TYPES = ["task", "userTask", "serviceTask", "manualTask", "scriptTask", "sendTask", "receiveTask", "businessRuleTask"];

const ELEMENT_TAG = new RegExp(`<(?:[\\w-]+:)?(${TASK_TYPES.join("|")}|startEvent|endEvent|exclusiveGateway|inclusiveGateway|sequenceFlow)\\b([^>]*)>`, "g");

export const normalizeTaskTypes = (xml: string) =>
    xml.replace(new RegExp(`<(/?)([\\w-]+:)?(${TASK_TYPES.slice(1).join("|")})\\b`, "g"), "<$1$2task");

const UNSUPPORTED: Record<string, string> = {
    subProcess: "subprocesses",
    adHocSubProcess: "ad-hoc subprocesses",
    transaction: "transactions",
    callActivity: "call activities",
    boundaryEvent: "boundary events",
    complexGateway: "complex gateways",
};

const countTags = (xml: string, tag: string) => (xml.match(new RegExp(`<(?:[\\w-]+:)?${tag}\\b`, "g")) ?? []).length;

const attribute = (attributes: string, name: string) =>
    new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(attributes)?.[1];

const decodeXml = (value: string) => value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&");

export const summarizeBpmn = (xml: string): BpmnSummary | null => {
    if (!/<(?:[\w-]+:)?definitions\b/.test(xml) || !/<(?:[\w-]+:)?process\b/.test(xml)) return null;

    const tasks: BpmnSummary["tasks"] = [];
    const gateways: string[] = [];
    const outgoing = new Map<string, number>();
    let startEvents = 0;
    let endEvents = 0;

    for (const [, tag, attributes] of xml.matchAll(ELEMENT_TAG)) {
        const id = attribute(attributes, "id");
        if (TASK_TYPES.includes(tag)) {
            if (id) tasks.push({id, name: decodeXml(attribute(attributes, "name") || id)});
            continue;
        }
        switch (tag) {
            case "startEvent":
                startEvents++;
                break;
            case "endEvent":
                endEvents++;
                break;
            case "sequenceFlow": {
                const source = attribute(attributes, "sourceRef");
                if (source) outgoing.set(source, (outgoing.get(source) ?? 0) + 1);
                break;
            }
            default:
                if (id) gateways.push(id);
        }
    }

    return {
        tasks,
        startEvents,
        endEvents,
        divergingGateways: gateways.filter(id => (outgoing.get(id) ?? 0) > 1),
        unsupported: Object.entries(UNSUPPORTED)
            .map(([tag, label]) => [countTags(xml, tag), label] as const)
            .filter(([count]) => count > 0)
            .map(([count, label]) => `${count} ${label}`),
        hasDiagram: /<(?:[\w-]+:)?BPMNShape\b/.test(xml),
    };
};

const xmlProblem = (xml: string) => {
    if (typeof DOMParser === "undefined") return null;
    const error = new DOMParser().parseFromString(xml, "application/xml").getElementsByTagName("parsererror")[0];
    if (!error) return null;
    const text = (error.textContent ?? "").replace(/This page contains the following errors:|Below is a rendering of the page up to the first error\./g, "");
    return text.split("\n").find(line => line.trim())?.trim() ?? "it is not well-formed";
};

const DISTRIBUTION_PARAMS: Record<string, string[]> = {
    fix: ["value"],
    expon: ["mean", "min", "max"],
    uniform: ["min", "max"],
    norm: ["mean", "std", "min", "max"],
    lognorm: ["mean", "variance", "min", "max"],
    gamma: ["mean", "variance", "min", "max"],
};
const DISTRIBUTIONS = Object.keys(DISTRIBUTION_PARAMS);

const REQUIRED_KEYS = [
    "resource_profiles",
    "task_resource_distribution",
    "arrival_time_distribution",
    "gateway_branching_probabilities",
];

const listOf = (values: string[], limit = 3) =>
    values.length <= limit
        ? values.map(value => `"${value}"`).join(", ")
        : `${values.slice(0, limit).map(value => `"${value}"`).join(", ")} and ${values.length - limit} more`;

const idsIn = (entries: unknown, key: string) =>
    new Set(Array.isArray(entries) ? entries.map(entry => entry?.[key]).filter(Boolean) : []);

export const validateSimulationInputs = (bpmnXml: string, parametersJson: string): string[] => {
    const errors: string[] = [];

    const brokenXml = bpmnXml.trim() ? xmlProblem(bpmnXml) : null;
    const bpmn = brokenXml ? null : summarizeBpmn(bpmnXml);
    if (brokenXml) {
        errors.push(`The BPMN file is not valid XML (${brokenXml}).`);
    } else if (!bpmn) {
        errors.push("The BPMN file is not a BPMN 2.0 model: it has no <definitions> or <process> element.");
    } else {
        if (bpmn.startEvents === 0) errors.push("The BPMN model has no start event, so no case can arrive.");
        if (bpmn.endEvents === 0) errors.push("The BPMN model has no end event, so no case can finish.");
        if (bpmn.tasks.length === 0) errors.push("The BPMN model has no tasks.");
        if (bpmn.unsupported.length) {
            errors.push(`The BPMN model has elements the simulator does not support: ${bpmn.unsupported.join(", ")}. Model them with plain tasks, gateways and events.`);
        }
        if (!bpmn.hasDiagram) {
            errors.push("The BPMN model has no diagram layout (BPMNDiagram), so it cannot be drawn. Export the model together with its diagram from your modelling tool.");
        }
    }

    let parameters: Record<string, unknown>;
    try {
        parameters = JSON.parse(parametersJson);
    } catch (error) {
        return [...errors, `The JSON file is not valid JSON (${(error as Error).message}).`];
    }
    if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
        return [...errors, "The JSON file is not a Prosimos simulation parameters file: it is not a JSON object."];
    }

    const required = parameters.model_type === "FUZZY" ? REQUIRED_KEYS : [...REQUIRED_KEYS, "resource_calendars"];
    const missing = required.filter(key => !(key in parameters));
    if (missing.length) {
        errors.push(`The JSON file is not in the Prosimos format: it has no ${listOf(missing, 6)} section.`);
        return errors;
    }

    const resourceIds = new Set<string>();
    const profiles = parameters.resource_profiles;
    if (Array.isArray(profiles)) {
        profiles.forEach(profile => (profile?.resource_list ?? []).forEach(resource => resource?.id && resourceIds.add(resource.id)));
    }

    const distributions = Array.isArray(parameters.task_resource_distribution) ? parameters.task_resource_distribution : [];
    const unknownResources = new Set<string>();
    distributions.forEach(entry => (entry?.resources ?? []).forEach(resource => {
        if (resource?.resource_id && !resourceIds.has(resource.resource_id)) unknownResources.add(resource.resource_id);
    }));
    if (unknownResources.size) {
        errors.push(`The JSON file assigns resources that are not in resource_profiles: ${listOf([...unknownResources])}.`);
    }

    const unknownDistributions = new Set<string>();
    const badParameters = new Set<string>();
    const checkDistribution = (entry, allowHistogram = false) => {
        const name = entry?.distribution_name;
        if (allowHistogram && name === "histogram_sampling") return;
        if (typeof name !== "string") return;
        if (!DISTRIBUTIONS.includes(name)) {
            unknownDistributions.add(name);
            return;
        }
        const values = Array.isArray(entry.distribution_params) ? entry.distribution_params : [];
        const expected = DISTRIBUTION_PARAMS[name];
        if (values.length < expected.length || values.slice(0, expected.length).some(param => !Number.isFinite(Number(param?.value)))) {
            badParameters.add(`"${name}" needs ${expected.length} numbers (${expected.join(", ")}) but has ${values.length}`);
        }
    };
    checkDistribution(parameters.arrival_time_distribution, true);
    distributions.forEach(entry => (entry?.resources ?? []).forEach(resource => checkDistribution(resource)));
    if (unknownDistributions.size) {
        errors.push(`The JSON file uses distributions that Prosimos does not know: ${listOf([...unknownDistributions])}. Use ${DISTRIBUTIONS.join(", ")}.`);
    }
    if (badParameters.size) {
        errors.push(`Some distributions in the JSON file have the wrong distribution_params: ${[...badParameters].slice(0, 3).join("; ")}.`);
    }

    if (parameters.model_type !== "FUZZY" && Array.isArray(profiles)) {
        const calendars = idsIn(parameters.resource_calendars, "id");
        const missingCalendars = new Set<string>();
        profiles.forEach(profile => (profile?.resource_list ?? []).forEach(resource => {
            if (resource?.calendar && !calendars.has(resource.calendar)) missingCalendars.add(resource.calendar);
        }));
        if (missingCalendars.size) {
            errors.push(`The JSON file gives resources calendars that are not in resource_calendars: ${listOf([...missingCalendars])}.`);
        }
        const idle = (Array.isArray(parameters.resource_calendars) ? parameters.resource_calendars : [])
            .filter(calendar => Array.isArray(calendar?.time_periods) && calendar.time_periods.length === 0)
            .map(calendar => calendar.name ?? calendar.id);
        if (idle.length) {
            errors.push(`These resource calendars have no working time, so their resources would never work: ${listOf(idle)}.`);
        }
    }
    if (Array.isArray(parameters.arrival_time_calendar) && parameters.arrival_time_calendar.length === 0) {
        errors.push("The arrival_time_calendar has no time periods, so no new case could ever arrive.");
    }

    const badBranches = (Array.isArray(parameters.gateway_branching_probabilities) ? parameters.gateway_branching_probabilities : [])
        .filter(gateway => {
            const values = (gateway?.probabilities ?? []).map(probability => probability?.value);
            if (!values.length || values.some(value => value === undefined)) return false;
            return Math.abs(values.reduce((total, value) => total + Number(value), 0) - 1) > 0.001;
        })
        .map(gateway => gateway.gateway_id);
    if (badBranches.length) {
        errors.push(`The branching probabilities of these gateways do not add up to 1: ${listOf(badBranches)}.`);
    }

    if (!bpmn) return errors;

    const coveredTasks = idsIn(distributions, "task_id");
    const uncovered = bpmn.tasks.filter(task => !coveredTasks.has(task.id));
    if (uncovered.length === bpmn.tasks.length && bpmn.tasks.length > 0) {
        errors.push("The JSON parameters do not belong to this BPMN model: none of its task ids appear in task_resource_distribution.");
    } else if (uncovered.length) {
        errors.push(`These tasks have no resources or durations in task_resource_distribution: ${listOf(uncovered.map(task => task.name))}.`);
    }

    if (!("branch_rules" in parameters)) {
        const coveredGateways = idsIn(parameters.gateway_branching_probabilities, "gateway_id");
        const uncoveredGateways = bpmn.divergingGateways.filter(id => !coveredGateways.has(id));
        if (uncoveredGateways.length) {
            errors.push(`These splitting gateways have no branching probabilities in gateway_branching_probabilities: ${listOf(uncoveredGateways)}.`);
        }
    }

    return errors;
};

export const collectActivities = (lines: string[], activityColumn: string): Set<string> => {
    const {split} = splitLogLines(lines);
    const index = split(lines[0] ?? "").indexOf(activityColumn);
    const activities = new Set<string>();
    if (index === -1) return activities;

    for (let i = 1; i < lines.length; i++) {
        const value = split(lines[i])[index]?.trim();
        if (value) activities.add(value);
    }
    return activities;
};

export const activitiesMissingFromModel = (activities: Set<string>, bpmnXml: string): string[] => {
    const names = new Set(summarizeBpmn(bpmnXml)?.tasks.map(task => task.name.trim()) ?? []);
    return [...activities].filter(activity => !names.has(activity)).sort();
};

export const describeMissingActivities = (missing: string[]) =>
    `${missing.length} ${missing.length === 1 ? "activity" : "activities"} in the log ${missing.length === 1 ? "has" : "have"} no task with the same name in the BPMN model: ${listOf(missing)}. Ongoing cases that went through ${missing.length === 1 ? "it" : "them"} may be placed wrongly or left out.`;
