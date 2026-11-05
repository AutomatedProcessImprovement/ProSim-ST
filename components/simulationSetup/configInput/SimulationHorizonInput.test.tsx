import {fireEvent, render, screen} from "@testing-library/react";
import SimulationHorizonInput from "@components/simulationSetup/configInput/SimulationHorizonInput";
import {DataContext} from "@context/DataContext";
import {TimeUnits} from "@definitions/config/enums";

describe("SimulationHorizonInput", () => {
    const renderInput = (simulationHorizonValue = 1) => {
        const setData = jest.fn();
        const {container} = render(
            <DataContext.Provider value={{
                data: {
                    id: "proc-1",
                    mapping: {},
                    config: {simulationHorizonValue, simulationHorizonUnit: TimeUnits.WEEKS, startingPoint: ""},
                    logFile: null,
                    bpmnFile: null,
                    jsonFile: null,
                },
                setData,
            } as never}>
                <form><SimulationHorizonInput/></form>
            </DataContext.Provider>
        );
        const visible = screen.getByLabelText("Simulation horizon value") as HTMLInputElement;
        const submitted = container.querySelector('input[name="simulationHorizonValue"]') as HTMLInputElement;
        return {visible, submitted};
    };

    it("lets the user clear the field and type a new value", () => {
        const {visible, submitted} = renderInput(1);

        fireEvent.change(visible, {target: {value: ""}});
        expect(visible.value).toBe("");
        expect(submitted.value).toBe("1");

        fireEvent.change(visible, {target: {value: "2"}});
        expect(visible.value).toBe("2");
        expect(submitted.value).toBe("2");
    });

    it("restores the last valid value on blur when left empty or invalid", () => {
        const {visible, submitted} = renderInput(3);

        fireEvent.change(visible, {target: {value: ""}});
        fireEvent.blur(visible);
        expect(visible.value).toBe("3");

        fireEvent.change(visible, {target: {value: "0"}});
        expect(submitted.value).toBe("3");
        fireEvent.blur(visible);
        expect(visible.value).toBe("3");
        expect(submitted.value).toBe("3");
    });
});
