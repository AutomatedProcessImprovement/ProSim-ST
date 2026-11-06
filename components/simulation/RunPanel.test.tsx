import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import axios from "axios";
import RunPanel from "@components/simulation/RunPanel";
import {ProcessAnalysis} from "@definitions/api/types";

jest.mock("axios", () => ({get: jest.fn()}));

const analysis = {
    arrived: 40,
    completed: 30,
    openAtEnd: 12,
    startTasks: {a: {waiting: 1, inWork: 1}, b: {waiting: 5, inWork: 0}},
} as unknown as ProcessAnalysis;

const details = {
    seed: 1234,
    files: {log: "log.csv", bpmn: "model.bpmn", parameters: "params.json"},
    stateSeconds: 1.25,
    simulationSeconds: 4,
};

describe("RunPanel", () => {
    const onShowTask = jest.fn();
    const show = (props = {}) => render(<RunPanel
        processId="p1"
        startDate="2025-03-25 08:00:00"
        endDate="2025-05-20 08:00:00"
        utcOffset="+02:00"
        openAtStart={2}
        analysis={analysis}
        taskName={id => `Task ${id}`}
        onShowTask={onShowTask}
        onClose={jest.fn()}
        {...props}
    />);

    beforeEach(() => {
        jest.clearAllMocks();
        (axios.get as jest.Mock).mockResolvedValue({data: details});
    });

    it("shows the starting state, biggest load first, and jumps to a task", async () => {
        show();

        expect(screen.getByText("2 cases were in progress at the start.", {exact: false})).toBeInTheDocument();
        const tasks = screen.getAllByRole("button", {name: /^Task /}).map(button => button.textContent);
        expect(tasks).toEqual(["Task b", "Task a"]);
        expect(screen.getByText("1 waiting · 1 in work")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: "Task b"}));
        expect(onShowTask).toHaveBeenCalledWith("b");
    });

    it("lists the inputs, the seed and how long the state took", async () => {
        show();

        expect(await screen.findByText("params.json")).toBeInTheDocument();
        expect(axios.get).toHaveBeenCalledWith("/api/simulation/p1/run");
        expect(screen.getByText("1234")).toBeInTheDocument();
        expect(screen.getByText("State computed in 1.3 s, simulated in 4.0 s.")).toBeInTheDocument();
        expect(screen.getByText("25 Mar 2025, 10:00")).toBeInTheDocument();
        expect(screen.getByText("UTC+02:00")).toBeInTheDocument();
    });

    it("still shows what it knows about a run the simulator no longer has", async () => {
        (axios.get as jest.Mock).mockRejectedValue(new Error("gone"));
        show();

        await waitFor(() => expect(axios.get).toHaveBeenCalled());
        expect(screen.getByText("25 Mar 2025, 10:00")).toBeInTheDocument();
        expect(screen.queryByText("Random seed")).not.toBeInTheDocument();
    });

    it("says an empty start has no starting state to compute", async () => {
        show({
            openAtStart: 0,
            analysis: {...analysis, startTasks: {}},
            scenario: {baseProcessId: "p0", label: "Empty start", edits: {pools: {}, arrivalPercent: 0, tasks: {}, emptyStart: true}},
        });

        expect(await screen.findByText("params.json")).toBeInTheDocument();
        expect(screen.getByText("This run starts with no case in progress.")).toBeInTheDocument();
        expect(screen.queryByText(/State /)).not.toBeInTheDocument();
    });

    it("says a what-if reuses the state of the as-is run", async () => {
        show({scenario: {baseProcessId: "p0", label: "Clerk 9 → 10", edits: {pools: {c: 10}, arrivalPercent: 0, tasks: {}}}});

        expect(await screen.findByText("State reused from the as-is run, where it took 1.3 s.")).toBeInTheDocument();
        expect(screen.getByText("Clerk 9 → 10")).toBeInTheDocument();
    });
});
