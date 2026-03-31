import {render, screen} from "@testing-library/react";
import Step from "@components/simulationSetup/Step";
import {ExclamationCircleIcon} from "@heroicons/react/16/solid";

describe("Step", () => {
    it("renders active state, form action, and cloned icon classes", () => {
        render(
            <Step
                form="form-1"
                idx={2}
                active
                label="My Step"
                icon={<ExclamationCircleIcon className="custom" />}
            />
        );

        const button = screen.getByRole("button", {name: "My Step"});
        expect(button).toHaveAttribute("form", "form-1");
        expect(button).toHaveAttribute("formaction", "action:go?step=2");
        expect(button.className).toContain("font-semibold");

        const icon = button.querySelector("svg");
        expect(icon?.getAttribute("class")).toContain("size-6");
        expect(icon?.getAttribute("class")).toContain("custom");
    });

    it("renders invalid indicator when valid is false", () => {
        const {container} = render(
            <Step
                form="form-1"
                idx={0}
                active={false}
                label="Invalid Step"
                valid={false}
            />
        );

        expect(screen.getByRole("button", {name: "Invalid Step"}).className).toContain("text-slate-400");
        expect(container.querySelectorAll("svg").length).toBeGreaterThan(1);
    });
});

