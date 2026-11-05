import {enableTouchNavigation} from "@modules/simulation/touchNavigation";

const touch = (type: string, ...points: Array<[number, number]>) => {
    const event = new Event(type, {bubbles: true, cancelable: true});
    Object.defineProperty(event, "touches", {value: points.map(([clientX, clientY]) => ({clientX, clientY}))});
    return event;
};

describe("modules/simulation/touchNavigation", () => {
    const setup = () => {
        const container = document.createElement("div");
        const canvas = {scroll: jest.fn(), zoom: jest.fn().mockReturnValue(1)};
        enableTouchNavigation(container, canvas);
        return {container, canvas};
    };

    it("pans with one finger and leaves the page still", () => {
        const {container, canvas} = setup();
        container.dispatchEvent(touch("touchstart", [100, 100]));
        const move = touch("touchmove", [120, 90]);
        container.dispatchEvent(move);

        expect(canvas.scroll).toHaveBeenCalledWith({dx: 20, dy: -10});
        expect(canvas.zoom).not.toHaveBeenCalled();
        expect(move.defaultPrevented).toBe(true);
    });

    it("zooms around the fingers with two", () => {
        const {container, canvas} = setup();
        container.dispatchEvent(touch("touchstart", [100, 100], [200, 100]));
        container.dispatchEvent(touch("touchmove", [50, 100], [250, 100]));

        expect(canvas.zoom).toHaveBeenLastCalledWith(2, {x: 150, y: 100});
    });

    it("stops once the fingers lift", () => {
        const {container, canvas} = setup();
        container.dispatchEvent(touch("touchstart", [100, 100]));
        container.dispatchEvent(touch("touchend"));
        container.dispatchEvent(touch("touchmove", [120, 90]));

        expect(canvas.scroll).not.toHaveBeenCalled();
    });
});
