import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import axios from "axios";
import {toast} from "sonner";
import WhatIfPanel from "@components/simulation/WhatIfPanel";

const push = jest.fn();

jest.mock("next/navigation", () => ({useRouter: () => ({push})}));
jest.mock("axios", () => ({get: jest.fn(), post: jest.fn()}));
jest.mock("sonner", () => ({toast: {error: jest.fn()}}));

const options = {
    baseProcessId: "p1",
    supported: true,
    editablePools: true,
    pools: [{id: "c", name: "Clerk", size: 9}],
    tasks: [{id: "t1", name: "Check"}],
    scenarios: [{id: "s0", label: "Clerk 9 → 10"}],
};

describe("WhatIfPanel", () => {
    const show = (props = {}) => render(<WhatIfPanel processId="p1" onClose={jest.fn()} {...props}/>);
    const loaded = () => screen.findByRole("button", {name: "More Clerk resources"});

    beforeEach(() => {
        jest.clearAllMocks();
        (axios.get as jest.Mock).mockImplementation((url: string) =>
            Promise.resolve({data: url.endsWith("/what-if") ? options : {stage: "done", durations: {}}}));
    });

    it("cannot run until something changed", async () => {
        show();
        await loaded();

        expect(screen.getByRole("button", {name: "Run what-if"})).toBeDisabled();

        fireEvent.click(screen.getByRole("button", {name: "More Clerk resources"}));
        expect(screen.getByRole("button", {name: "Run what-if"})).toBeEnabled();
        expect(screen.getByText("was 9")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: "Less Clerk resources"}));
        expect(screen.getByRole("button", {name: "Run what-if"})).toBeDisabled();
    });

    it("keeps at least one resource in a pool", async () => {
        show({initialEdits: {pools: {c: 1}, arrivalPercent: 0, tasks: {}}});
        await loaded();

        fireEvent.click(screen.getByRole("button", {name: "Less Clerk resources"}));

        expect(screen.getByLabelText("Clerk resources")).toHaveTextContent("1");
    });

    it("sends the changes and opens the comparison when the run is done", async () => {
        jest.useFakeTimers();
        (axios.post as jest.Mock).mockResolvedValue({data: {id: "s1"}});
        show();
        await act(async () => {
            await jest.advanceTimersByTimeAsync(0);
        });

        fireEvent.click(screen.getByRole("button", {name: "More Clerk resources"}));
        fireEvent.click(screen.getByRole("button", {name: "More new cases"}));
        fireEvent.click(screen.getByRole("button", {name: "Less Check duration"}));
        fireEvent.click(screen.getByRole("button", {name: "Run what-if"}));
        await act(async () => {
            await jest.advanceTimersByTimeAsync(1100);
        });
        jest.useRealTimers();

        expect(axios.post).toHaveBeenCalledWith("/api/simulation/p1/what-if", {
            pools: {c: 10}, arrivalPercent: 10, tasks: {t1: -10},
        });
        expect(push).toHaveBeenCalledWith("/simulation/s1/compare");
    });

    it("goes straight to a what-if that already ran", async () => {
        (axios.post as jest.Mock).mockResolvedValue({data: {id: "s0", existing: true}});
        show();
        fireEvent.click(await loaded());
        fireEvent.click(screen.getByRole("button", {name: "Run what-if"}));

        await waitFor(() => expect(push).toHaveBeenCalledWith("/simulation/s0/compare"));
    });

    it("reports a refused run and stays open", async () => {
        (axios.post as jest.Mock).mockRejectedValue({response: {data: {error: "The simulator is busy"}}});
        show();
        fireEvent.click(await loaded());
        fireEvent.click(screen.getByRole("button", {name: "Run what-if"}));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith(
            "The what-if run could not start", {description: "The simulator is busy"}));
        expect(screen.getByRole("button", {name: "Run what-if"})).toBeEnabled();
    });

    it("explains why a run from before this feature cannot be edited", async () => {
        (axios.get as jest.Mock).mockResolvedValue({data: {...options, supported: false}});
        show();

        expect(await screen.findByText(/Run it again to use them/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Run what-if"})).not.toBeInTheDocument();
    });

    it("links to earlier what-ifs", async () => {
        show();
        await loaded();

        expect(screen.getByRole("link", {name: "Clerk 9 → 10"})).toHaveAttribute("href", "/simulation/s0/compare");
    });
});
