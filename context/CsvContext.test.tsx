import {useContext} from "react";
import {fireEvent, render, screen} from "@testing-library/react";
import {CsvContext, CsvProvider} from "@context/CsvContext";

const Consumer = () => {
    const {csvData, setCsvData} = useContext(CsvContext);

    return (
        <>
            <span data-testid="headers">{csvData.headers.join(",")}</span>
            <button onClick={() => setCsvData((prev) => ({...prev, headers: ["case", "activity"]}))}>update</button>
        </>
    );
};

describe("CsvProvider", () => {
    it("uses the context default setter as an identity function when no provider is mounted", () => {
        expect((CsvContext as unknown as { _currentValue: { setCsvData: (value: unknown) => unknown } })._currentValue.setCsvData("value")).toBe("value");
    });

    it("provides default CSV state and updates it", () => {
        render(
            <CsvProvider>
                <Consumer />
            </CsvProvider>
        );

        expect(screen.getByTestId("headers")).toHaveTextContent("");

        fireEvent.click(screen.getByRole("button", {name: "update"}));

        expect(screen.getByTestId("headers")).toHaveTextContent("case,activity");
    });
});

