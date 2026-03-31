import {useContext} from "react";
import {fireEvent, render, screen} from "@testing-library/react";
import {DataContext, DataProvider} from "@context/DataContext";

const Consumer = () => {
    const {data, setData} = useContext(DataContext);

    return (
        <>
            <span data-testid="id">{data.id}</span>
            <span data-testid="unit">{data.config.simulationHorizonUnit}</span>
            <button onClick={() => setData((prev) => ({...prev, id: "new-process-id"}))}>update</button>
        </>
    );
};

describe("DataProvider", () => {
    it("uses the context default setter as an identity function when no provider is mounted", () => {
        expect((DataContext as unknown as { _currentValue: { setData: (value: unknown) => unknown } })._currentValue.setData("value")).toBe("value");
    });

    it("provides default values and updates state", () => {
        render(
            <DataProvider>
                <Consumer />
            </DataProvider>
        );

        expect(screen.getByTestId("id")).toHaveTextContent("");
        expect(screen.getByTestId("unit")).toHaveTextContent("weeks");

        fireEvent.click(screen.getByRole("button", {name: "update"}));

        expect(screen.getByTestId("id")).toHaveTextContent("new-process-id");
    });
});

