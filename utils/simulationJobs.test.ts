import {activeJobCount, createJob, failJob, getJob, jobStatus, removeJob, setJobStage} from "./simulationJobs";

describe("simulation jobs", () => {
    afterEach(() => ["a", "b"].forEach(removeJob));

    it("takes the detailed stage and durations from the simulator while it runs", () => {
        const job = createJob("a", 0);

        expect(jobStatus(job, null, 1000)).toEqual({stage: "queued", durations: {}});
        expect(jobStatus(job, {stage: "simulation", durations: {queued: 0.1, state: 1.2, simulation: 3}}, 1000)).toEqual({
            stage: "simulation",
            durations: {queued: 0.1, state: 1.2, simulation: 3},
        });
        expect(jobStatus(job, {stage: "done", durations: {playback: 2}}, 1000).stage).toBe("saving");
    });

    it("times the saving stage and keeps it once done", () => {
        createJob("a", 0);
        setJobStage("a", "saving", 1000);
        expect(jobStatus(getJob("a")!, null, 3500).durations).toEqual({saving: 2.5});

        setJobStage("a", "done", 4000);
        expect(jobStatus(getJob("a")!, {stage: "done", durations: {state: 1}}, 9000)).toEqual({
            stage: "done",
            durations: {state: 1, saving: 3},
        });
    });

    it("reports failures and counts only active jobs", () => {
        createJob("a");
        createJob("b");
        expect(activeJobCount()).toBe(2);

        failJob("b", {stage: "state", message: "KeyError: 'x'"});
        expect(activeJobCount()).toBe(1);
        expect(jobStatus(getJob("b")!, null)).toEqual({
            stage: "failed",
            durations: {},
            error: {stage: "state", message: "KeyError: 'x'"},
        });
    });

    it("forgets finished jobs after an hour", () => {
        createJob("a", 0);
        setJobStage("a", "done", 0);
        createJob("b", 2 * 60 * 60 * 1000);
        expect(getJob("a")).toBeUndefined();
    });
});
