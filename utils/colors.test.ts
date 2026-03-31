import {getRandomColor} from "@utils/colors";

describe("getRandomColor", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("returns a hex color string with six uppercase digits", () => {
        jest.spyOn(Math, "random")
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(1 / 16)
            .mockReturnValueOnce(2 / 16)
            .mockReturnValueOnce(10 / 16)
            .mockReturnValueOnce(14 / 16)
            .mockReturnValueOnce(15 / 16);

        expect(getRandomColor()).toBe("#012AEF");
    });

    it("handles lower and upper random boundaries", () => {
        jest.spyOn(Math, "random").mockReturnValue(0);
        expect(getRandomColor()).toBe("#000000");

        jest.spyOn(Math, "random").mockReturnValue(1 - Number.EPSILON);
        expect(getRandomColor()).toBe("#FFFFFF");
    });
});


