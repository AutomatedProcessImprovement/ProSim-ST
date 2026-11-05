import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import axios from "axios";
import CaseBanner from "@components/simulation/CaseBanner";
import {LifecycleTypes} from "@definitions/simulation/enums";

jest.mock("axios", () => ({get: jest.fn()}));

const NOTHING: string[] = [];
const at = (hour: number) => Date.UTC(2024, 0, 1, hour);
const events = [
    {lifecycle: LifecycleTypes.CASE_ARRIVAL, nodeId: "Start", timestamp: "2024-01-01 01:00:00", paths: {t: ["Start", "Flow_1"]}},
    {lifecycle: LifecycleTypes.START, nodeId: "Task_A", timestamp: "2024-01-01 02:00:00", paths: {t: ["Task_A"]}},
    {lifecycle: LifecycleTypes.CASE_END, nodeId: "End", timestamp: "2024-01-01 04:00:00", paths: {t: ["End"]}},
];

describe("CaseBanner", () => {
    let moment: number;
    const markers = {addMarker: jest.fn(), removeMarker: jest.fn()};
    const getMarkers = () => markers;
    const getCurrentTime = () => moment;
    const describeCase = () => ["In work: Task A for 1 h", "Case open 2 h"];
    const onMissing = jest.fn();
    const onClose = jest.fn();

    const show = (startElements = NOTHING) => render(<CaseBanner
        processId="p1"
        caseId={7}
        startElements={startElements}
        utcOffset="+00:00"
        getMarkers={getMarkers}
        getCurrentTime={getCurrentTime}
        describeCase={describeCase}
        onMissing={onMissing}
        onClose={onClose}
    />);

    beforeEach(() => {
        jest.clearAllMocks();
        moment = at(3);
        (axios.get as jest.Mock).mockResolvedValue({data: events});
    });

    it("marks the path so far and says what the case is doing", async () => {
        show();

        expect(await screen.findByText(/In work: Task A for 1 h · Case open 2 h/)).toBeInTheDocument();
        expect(axios.get).toHaveBeenCalledWith("/api/simulation/p1/case/7");
        expect(markers.addMarker.mock.calls.map(([elementId]) => elementId)).toEqual(["Start", "Flow_1", "Task_A"]);
    });

    it("clears the path when the case stops being followed", async () => {
        const {unmount} = show();
        await waitFor(() => expect(markers.addMarker).toHaveBeenCalledTimes(3));

        unmount();

        expect(markers.removeMarker.mock.calls.map(([elementId]) => elementId)).toEqual(["Start", "Flow_1", "Task_A"]);
    });

    it("shrinks the path when the timeline moves back, and says when the case starts", async () => {
        jest.useFakeTimers();
        try {
            show();
            await act(async () => { await jest.advanceTimersByTimeAsync(0); });
            moment = at(0);
            await act(async () => { await jest.advanceTimersByTimeAsync(300); });

            expect(screen.getByText(/Starts 1 Jan 01:00/)).toBeInTheDocument();
            expect(markers.removeMarker).toHaveBeenCalledTimes(3);
        } finally {
            jest.useRealTimers();
        }
    });

    it("says when a finished case ended and how long it took", async () => {
        moment = at(5);
        show();

        expect(await screen.findByText(/Finished 1 Jan 04:00, open 3 h/)).toBeInTheDocument();
    });

    it("reports a case that is not in the simulation", async () => {
        (axios.get as jest.Mock).mockResolvedValue({data: []});
        show();

        await waitFor(() => expect(onMissing).toHaveBeenCalled());
    });

    it("accepts a case without events when it was open at the start", async () => {
        (axios.get as jest.Mock).mockResolvedValue({data: []});
        show(["Task_Z"]);

        await waitFor(() => expect(markers.addMarker).toHaveBeenCalledWith("Task_Z", "case-path"));
        expect(onMissing).not.toHaveBeenCalled();
    });

    it("closes", async () => {
        show();
        fireEvent.click(screen.getByRole("button", {name: "Stop following this case"}));
        expect(onClose).toHaveBeenCalled();
    });
});
