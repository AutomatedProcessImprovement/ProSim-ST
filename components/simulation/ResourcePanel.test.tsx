import {fireEvent, render, screen, within} from "@testing-library/react";
import axios from "axios";
import ResourcePanel, {toColumns} from "@components/simulation/ResourcePanel";

jest.mock("axios", () => ({get: jest.fn()}));

const HOUR = 3600000;
const start = Date.parse("2025-03-03T08:00:00Z");
const timeline = {
    startDate: "2025-03-03T08:00:00+00:00",
    endDate: "2025-03-03T11:00:00+00:00",
    stepMs: HOUR,
    calendarsKnown: true,
    pools: [
        {
            id: "a", name: "Appraiser", size: 2, utilization: 0.4,
            busy: [0, 1, 2, 0], idle: [2, 1, 0, 0],
            resources: [{name: "Appraiser_0", utilization: 0.2}, {name: "Appraiser_1", utilization: 0.6}],
        },
        {id: "c", name: "Clerk", size: 3, utilization: 0.9, busy: [3, 3, 3, 3], idle: [0, 0, 0, 0], resources: []},
    ],
};

describe("ResourcePanel", () => {
    const show = (time: number | null = start + HOUR) => render(
        <ResourcePanel processId="p1" utcOffset="+00:00" getCurrentTime={() => time} onClose={jest.fn()}/>,
    );

    beforeEach(() => {
        jest.clearAllMocks();
        (axios.get as jest.Mock).mockResolvedValue({data: timeline});
    });

    it("shows the busiest pool first with its state at the current moment", async () => {
        show();

        const pools = await screen.findAllByRole("listitem");
        expect(axios.get).toHaveBeenCalledWith("/api/simulation/p1/resources");
        expect(within(pools[0]).getByText("Clerk")).toBeInTheDocument();
        expect(within(pools[0]).getByText("90% busy")).toBeInTheDocument();
        expect(within(pools[1]).getByText("1 busy")).toBeInTheDocument();
        expect(within(pools[1]).getByText("1 idle")).toBeInTheDocument();
    });

    it("counts everyone else as off shift", async () => {
        show(start + 3 * HOUR);

        expect(await screen.findByText("2 off shift")).toBeInTheDocument();
    });

    it("opens a pool to rank its resources", async () => {
        show();

        fireEvent.click(await screen.findByRole("button", {name: /Appraiser/}));

        const names = screen.getAllByText(/^Appraiser_/).map(element => element.textContent);
        expect(names).toEqual(["Appraiser_1", "Appraiser_0"]);
        expect(screen.getByText("60%")).toBeInTheDocument();
    });

    it("says so when the data is gone", async () => {
        (axios.get as jest.Mock).mockRejectedValue(new Error("gone"));
        show();

        expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    });
});

describe("toColumns", () => {
    it("averages over working samples and leaves off-shift columns empty", () => {
        expect(toColumns({busy: [2, 0, 0, 0], idle: [0, 2, 0, 0]}, 2)).toEqual([{busy: 1, idle: 1}, {busy: 0, idle: 0}]);
    });
});
