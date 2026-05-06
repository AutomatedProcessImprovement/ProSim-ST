import { getRandomColor, resetColorCycle, TOKEN_COLOR_PALETTE } from "@utils/colors";

describe("getRandomColor", () => {
    beforeEach(() => {
        resetColorCycle();
    });

    it("returns the first palette color on first call", () => {
        expect(getRandomColor()).toBe(TOKEN_COLOR_PALETTE[0]);
    });

    it("cycles sequentially through the palette", () => {
        const first5 = [getRandomColor(), getRandomColor(), getRandomColor(), getRandomColor(), getRandomColor()];
        expect(first5).toEqual(TOKEN_COLOR_PALETTE.slice(0, 5));
    });

    it("wraps around after exhausting the palette", () => {
        for (let i = 0; i < TOKEN_COLOR_PALETTE.length; i += 1) getRandomColor();
        expect(getRandomColor()).toBe(TOKEN_COLOR_PALETTE[0]);
    });

    it("returns only colors from the curated palette", () => {
        const seen = new Set<string>();
        for (let i = 0; i < 200; i += 1) seen.add(getRandomColor());
        seen.forEach(color => expect(TOKEN_COLOR_PALETTE).toContain(color));
    });

    it("resetColorCycle restarts from the first color", () => {
        getRandomColor(); getRandomColor(); getRandomColor();
        resetColorCycle();
        expect(getRandomColor()).toBe(TOKEN_COLOR_PALETTE[0]);
    });
});
