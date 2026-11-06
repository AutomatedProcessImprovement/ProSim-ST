import {fireEvent, render, screen} from "@testing-library/react";
import OpenCasesChart from "@components/simulationSetup/OpenCasesChart";

const from = Date.UTC(2025, 0, 1);
const to = Date.UTC(2025, 0, 11);
const series = {from, to, counts: [1, 5, 2], peak: 5, peakMoment: Date.UTC(2025, 0, 6)};

describe("OpenCasesChart", () => {
    it("sets the start at the clicked moment", () => {
        const onPick = jest.fn();
        render(<OpenCasesChart series={series} selected={null} utcOffset="+00:00" onPick={onPick}/>);
        const chart = screen.getByRole("img");
        chart.getBoundingClientRect = () => ({left: 100, width: 200}) as DOMRect;

        fireEvent.click(chart, {clientX: 150});

        expect(onPick).toHaveBeenCalledWith(from + (to - from) / 4);
    });

    it("offers the busiest moment", () => {
        const onPick = jest.fn();
        render(<OpenCasesChart series={series} selected={from} utcOffset="+00:00" onPick={onPick}/>);

        fireEvent.click(screen.getByRole("button", {name: "Use the busiest moment"}));

        expect(onPick).toHaveBeenCalledWith(series.peakMoment);
        expect(screen.getByText("(highest 5)")).toBeInTheDocument();
    });
});
