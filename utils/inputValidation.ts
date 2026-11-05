export type BpmnSummary = {
    tasks: {id: string; name: string}[];
    startEvents: number;
    endEvents: number;
    divergingGateways: string[];
};

const ELEMENT_TAG = /<(?:[\w-]+:)?(task|startEvent|endEvent|exclusiveGateway|inclusiveGateway|sequenceFlow)\b([^>]*)>/g;

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
        switch (tag) {
            case "task":
                if (id) tasks.push({id, name: decodeXml(attribute(attributes, "name") || id)});
                break;
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
    };
};

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

    const bpmn = summarizeBpmn(bpmnXml);
    if (!bpmn) {
        errors.push("The BPMN file is not a BPMN 2.0 model: it has no <definitions> or <process> element.");
    } else {
        if (bpmn.startEvents === 0) errors.push("The BPMN model has no start event, so no case can arrive.");
        if (bpmn.endEvents === 0) errors.push("The BPMN model has no end event, so no case can finish.");
        if (bpmn.tasks.length === 0) errors.push("The BPMN model has no tasks.");
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
    const split = (line: string) => line.split(/[;,]/);
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
