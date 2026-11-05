import {readFileSync} from "fs";
import {join} from "path";
import {
    activitiesMissingFromModel,
    collectActivities,
    describeMissingActivities,
    summarizeBpmn,
    validateSimulationInputs,
} from "./inputValidation";

const sample = (name: string, file: string) => readFileSync(join(__dirname, "../sampleProcesses", name, file), "utf8");

const bpmn = (body: string) => `<?xml version="1.0"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL">
  <bpmn:process id="p">${body}</bpmn:process>
</bpmn:definitions>`;

const MODEL = bpmn(`
    <bpmn:startEvent id="start"/>
    <bpmn:task id="a" name="Check &amp; approve"/>
    <bpmn:exclusiveGateway id="split"/>
    <bpmn:task id="b" name="Reject"/>
    <bpmn:endEvent id="end"/>
    <bpmn:sequenceFlow id="f1" sourceRef="start" targetRef="a"/>
    <bpmn:sequenceFlow id="f2" sourceRef="a" targetRef="split"/>
    <bpmn:sequenceFlow id="f3" sourceRef="split" targetRef="b"/>
    <bpmn:sequenceFlow id="f4" sourceRef="split" targetRef="end"/>
    <bpmn:sequenceFlow id="f5" sourceRef="b" targetRef="end"/>
`);

const parameters = (overrides: Record<string, unknown> = {}) => JSON.stringify({
    resource_profiles: [{id: "pool", name: "Pool", resource_list: [{id: "clerk", name: "Clerk", amount: 1}]}],
    resource_calendars: [],
    arrival_time_distribution: {},
    task_resource_distribution: [
        {task_id: "a", resources: [{resource_id: "clerk"}]},
        {task_id: "b", resources: [{resource_id: "clerk"}]},
    ],
    gateway_branching_probabilities: [{gateway_id: "split", probabilities: []}],
    ...overrides,
});

describe("summarizeBpmn", () => {
    it("reads tasks, events and splitting gateways from prefixed and unprefixed models", () => {
        expect(summarizeBpmn(MODEL)).toEqual({
            tasks: [{id: "a", name: "Check & approve"}, {id: "b", name: "Reject"}],
            startEvents: 1,
            endEvents: 1,
            divergingGateways: ["split"],
        });
        expect(summarizeBpmn("<html><body>no model</body></html>")).toBeNull();
    });
});

describe("validateSimulationInputs", () => {
    it.each(["loanApplication", "p2p"])("accepts the bundled %s sample", name => {
        expect(validateSimulationInputs(sample(name, "bpmn_model.bpmn"), sample(name, "json_parameters.json"))).toEqual([]);
    });

    it("accepts matching inputs", () => {
        expect(validateSimulationInputs(MODEL, parameters())).toEqual([]);
    });

    it("rejects files that are not a BPMN model or not JSON", () => {
        expect(validateSimulationInputs("<html/>", "{oops")).toEqual([
            "The BPMN file is not a BPMN 2.0 model: it has no <definitions> or <process> element.",
            expect.stringMatching(/^The JSON file is not valid JSON/),
        ]);
    });

    it("reports a model without start or end events", () => {
        const model = bpmn(`<bpmn:task id="a" name="A"/>`);
        expect(validateSimulationInputs(model, parameters({task_resource_distribution: [{task_id: "a", resources: []}]}))).toEqual([
            "The BPMN model has no start event, so no case can arrive.",
            "The BPMN model has no end event, so no case can finish.",
        ]);
    });

    it("reports JSON that is not in the Prosimos format", () => {
        expect(validateSimulationInputs(MODEL, JSON.stringify({tasks: []}))).toEqual([
            'The JSON file is not in the Prosimos format: it has no "resource_profiles", "task_resource_distribution", "arrival_time_distribution", "gateway_branching_probabilities", "resource_calendars" section.',
        ]);
        expect(validateSimulationInputs(MODEL, "[]")).toEqual([
            "The JSON file is not a Prosimos simulation parameters file: it is not a JSON object.",
        ]);
    });

    it("does not need resource calendars for fuzzy models", () => {
        const json = JSON.parse(parameters());
        delete json.resource_calendars;
        expect(validateSimulationInputs(MODEL, JSON.stringify({...json, model_type: "FUZZY"}))).toEqual([]);
    });

    it("reports parameters made for another model", () => {
        expect(validateSimulationInputs(MODEL, parameters({task_resource_distribution: [{task_id: "x", resources: []}]}))).toEqual([
            "The JSON parameters do not belong to this BPMN model: none of its task ids appear in task_resource_distribution.",
        ]);
    });

    it("names tasks without durations, unknown resources and gateways without probabilities", () => {
        const json = parameters({
            task_resource_distribution: [{task_id: "a", resources: [{resource_id: "ghost"}]}],
            gateway_branching_probabilities: [],
        });
        expect(validateSimulationInputs(MODEL, json)).toEqual([
            'The JSON file assigns resources that are not in resource_profiles: "ghost".',
            'These tasks have no resources or durations in task_resource_distribution: "Reject".',
            'These splitting gateways have no branching probabilities in gateway_branching_probabilities: "split".',
        ]);
    });

    it("leaves gateway probabilities alone when branch rules are used", () => {
        expect(validateSimulationInputs(MODEL, parameters({gateway_branching_probabilities: [], branch_rules: []}))).toEqual([]);
    });
});

describe("log activities", () => {
    it("lists log activities with no task of the same name", () => {
        const lines = ["case;activity;end", "1;Check & approve;x", "1;Archive;x", "2;Notify;x", "2;Reject;x"];
        const missing = activitiesMissingFromModel(collectActivities(lines, "activity"), MODEL);

        expect(missing).toEqual(["Archive", "Notify"]);
        expect(describeMissingActivities(missing)).toBe(
            '2 activities in the log have no task with the same name in the BPMN model: "Archive", "Notify". Ongoing cases that went through them may be placed wrongly or left out.',
        );
    });

    it("finds every activity of the bundled samples in their models", () => {
        for (const name of ["loanApplication", "p2p"]) {
            const lines = sample(name, "ongoing_event_log.csv").split(/\r?\n/).filter(Boolean);
            expect(activitiesMissingFromModel(collectActivities(lines, "Activity"), sample(name, "bpmn_model.bpmn"))).toEqual([]);
        }
    });
});
