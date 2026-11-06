import {fireEvent, render, screen, within} from "@testing-library/react";
import axios from "axios";
import Compare from "./page";

jest.mock("next/navigation", () => ({useParams: () => ({id: "s1"})}));
jest.mock("axios", () => ({get: jest.fn()}));

const HOUR = 3600000;
const task = (waitMs: number, queueAverage: number, queue: number[]) => ({count: 3, waitMs, queueAverage, queuePeak: Math.max(...queue), queue});
const summary = {
    startDate: "2025-03-03T08:00:00+00:00",
    endDate: "2025-03-10T08:00:00+00:00",
    stepMs: HOUR,
    arrived: 100,
    openAtEnd: 20,
    waitingAtEnd: 12,
};
const spread = (low: number, high: number) => ({mean: (low + high) / 2, low, high});
const data = {
    processId: "s1",
    baseProcessId: "p1",
    label: "Clerk 9 → 11",
    edits: {pools: {c: 11}, arrivalPercent: 0, tasks: {}},
    utcOffset: "+00:00",
    comparison: {
        asIs: {
            ...summary, finished: 80, cycleMs: 48 * HOUR, waitMs: 5 * HOUR, queueAverage: 10, queuePeak: 20, queue: [10, 20],
            tasks: {Check: task(5 * HOUR, 10, [10, 20])},
        },
        toBe: {
            ...summary, finished: 90, cycleMs: 40 * HOUR, waitMs: 2 * HOUR, queueAverage: 4, queuePeak: 8, queue: [4, 8],
            tasks: {Check: task(2 * HOUR, 4, [4, 8])},
        },
        poolsAsIs: [{id: "c", name: "Clerk", size: 9, utilization: 0.95}],
        poolsToBe: [{id: "c", name: "Clerk", size: 11, utilization: 0.8}],
        repeats: {
            seeds: 9,
            changes: {
                waitMs: spread(-4 * HOUR, -2 * HOUR),
                queueAverage: spread(-7, 1),
                cycleMs: spread(-9 * HOUR, -7 * HOUR),
                finished: spread(5, 12),
            },
            tasks: {Check: {waitMs: spread(-4 * HOUR, -2 * HOUR), queueAverage: spread(-7, -3)}},
        },
    },
};

describe("Compare page", () => {
    beforeEach(() => jest.clearAllMocks());

    const row = (name: string) => screen.getByRole("row", {name: new RegExp(`^${name}`)});

    it("shows both sides, the change and how far to trust it", async () => {
        (axios.get as jest.Mock).mockResolvedValue({data});
        render(<Compare/>);

        await screen.findByText("Clerk 9 → 11");
        expect(axios.get).toHaveBeenCalledWith("/api/simulation/s1/comparison");

        const waiting = row("Average waiting");
        expect(within(waiting).getByText("5 h")).toBeInTheDocument();
        expect(within(waiting).getByText("2 h")).toBeInTheDocument();
        expect(within(waiting).getByText("−3 h")).toBeInTheDocument();
        expect(within(waiting).getByText("−4 h to −2 h")).toBeInTheDocument();
        expect(within(waiting).getByText("Clearly better")).toBeInTheDocument();

        expect(within(row("Cases waiting on average")).getByText("Could be chance")).toBeInTheDocument();
        expect(within(row("Cases finished")).getByText("Clearly better")).toBeInTheDocument();
        expect(within(row("Clerk")).getByText("95%")).toBeInTheDocument();
    });

    it("focuses the chart on a task", async () => {
        (axios.get as jest.Mock).mockResolvedValue({data});
        render(<Compare/>);

        fireEvent.click(await screen.findByRole("button", {name: "Check"}));

        expect(screen.getByRole("button", {name: "Check"})).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByText("Check", {selector: ".stats-unit"})).toBeInTheDocument();
    });

    it("does not claim a verdict from too few seeds", async () => {
        (axios.get as jest.Mock).mockResolvedValue({
            data: {...data, comparison: {...data.comparison, repeats: {...data.comparison.repeats, seeds: 2}}},
        });
        render(<Compare/>);

        await screen.findByText("Clerk 9 → 11");
        expect(screen.getAllByText("Not enough repeats").length).toBeGreaterThan(1);
        expect(screen.getByText(/too few to tell a real change from chance/)).toBeInTheDocument();
    });

    it("explains an expired link", async () => {
        (axios.get as jest.Mock).mockRejectedValue({response: {status: 404}});
        render(<Compare/>);

        expect(await screen.findByText("Comparison not found or expired")).toBeInTheDocument();
    });
});
