import {fireEvent, render, screen} from "@testing-library/react";
import Stepper from "@components/simulationSetup/Stepper";
import Step from "@components/simulationSetup/Step";
import {toast} from "sonner";

jest.mock("sonner", () => ({
    toast: {
        error: jest.fn(),
    },
}));

describe("Stepper", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("validates the active step, moves forward, and allows going back", () => {
        const firstOnNext = jest.fn(() => true);

        render(
            <Stepper onSubmit={jest.fn()}>
                <Step label="First" onNext={firstOnNext}>
                    <input name="firstField" defaultValue="value" />
                </Step>
                <Step label="Second" onNext={() => true}>
                    <div>Second step content</div>
                </Step>
            </Stepper>
        );

        fireEvent.click(screen.getByRole("button", {name: /next/i}));

        expect(firstOnNext).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Second step content")).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", {name: /previous/i}));
        expect(screen.getByDisplayValue("value")).toBeInTheDocument();
    });

    it("submits when all steps are valid", () => {
        const onSubmit = jest.fn();

        render(
            <Stepper onSubmit={onSubmit}>
                <Step label="First" onNext={() => true}>
                    <div>first</div>
                </Step>
                <Step label="Final" onNext={() => true}>
                    <div>final</div>
                </Step>
            </Stepper>
        );

        fireEvent.click(screen.getByRole("button", {name: /next/i}));
        fireEvent.click(screen.getByRole("button", {name: /run/i}));

        expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("blocks submission and shows a toast when any step is invalid", () => {
        const onSubmit = jest.fn();

        render(
            <Stepper onSubmit={onSubmit}>
                <Step label="First" onNext={() => false}>
                    <div>first</div>
                </Step>
                <Step label="Final" onNext={() => true}>
                    <div>final</div>
                </Step>
            </Stepper>
        );

        fireEvent.click(screen.getByRole("button", {name: /next/i}));
        fireEvent.click(screen.getByRole("button", {name: /run/i}));

        expect(onSubmit).not.toHaveBeenCalled();
        expect(toast.error).toHaveBeenCalledWith(
            "Error on form submission!",
            {description: "Please fix the errors in the form before submitting"}
        );
    });

    it("navigates directly to a step through the step header button", () => {
        render(
            <Stepper onSubmit={jest.fn()}>
                <Step label="First" onNext={() => true}>
                    <div>first</div>
                </Step>
                <Step label="Second" onNext={() => true}>
                    <div>second</div>
                </Step>
            </Stepper>
        );

        fireEvent.click(screen.getAllByRole("button", {name: "Second"})[0]);

        expect(screen.getByText("second")).toBeInTheDocument();
    });

    it("uses the default onNext handler when a step omits it", () => {
        render(
            <Stepper onSubmit={jest.fn()}>
                <Step label="First">
                    <div>first</div>
                </Step>
                <Step label="Second" onNext={() => true}>
                    <div>second</div>
                </Step>
            </Stepper>
        );

        fireEvent.click(screen.getByRole("button", {name: /next/i}));

        expect(screen.getByText("second")).toBeInTheDocument();
    });

    it("ignores unknown submit actions without submitting", () => {
        const onSubmit = jest.fn();

        render(
            <Stepper onSubmit={onSubmit}>
                <Step label="First" onNext={() => true}>
                    <input name="firstField" defaultValue="value" />
                </Step>
                <Step label="Second" onNext={() => true}>
                    <div>second</div>
                </Step>
            </Stepper>
        );

        const form = document.querySelector("form") as HTMLFormElement;
        const button = document.createElement("button");
        button.type = "submit";
        button.textContent = "external-unknown";
        button.setAttribute("form", form.id);
        button.setAttribute("formaction", "action:unknown");
        document.body.appendChild(button);

        fireEvent.click(button);

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByDisplayValue("value")).toBeInTheDocument();

        button.remove();
    });

    it("ignores submits with no action information", () => {
        const onSubmit = jest.fn();

        render(
            <Stepper onSubmit={onSubmit}>
                <Step label="First" onNext={() => true}>
                    <input name="firstField" defaultValue="value" />
                </Step>
                <Step label="Second" onNext={() => true}>
                    <div>second</div>
                </Step>
            </Stepper>
        );

        const form = document.querySelector("form") as HTMLFormElement;
        fireEvent.submit(form, {nativeEvent: {submitter: null}});

        expect(onSubmit).not.toHaveBeenCalled();
        expect(screen.getByDisplayValue("value")).toBeInTheDocument();
    });
});

