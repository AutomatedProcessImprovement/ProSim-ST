// Glasbey-Light palette (first 80 entries) — from colorcet's glasbey_light_n_256.
// Algorithmically optimized for maximum perceptual distance on white backgrounds.
// Source: https://colorcet.holoviz.org/user_guide/Categorical.html
export const TOKEN_COLOR_PALETTE: readonly string[] = [
    "#d60000", "#018700", "#b500ff", "#05acc6", "#97ff00", "#ffa52f",
    "#ff8ec8", "#79525e", "#00fdcf", "#afa5ff", "#93ac83", "#9a6900",
    "#366962", "#d3008c", "#fdf490", "#c86e66", "#9ee2ff", "#00c846",
    "#a877ac", "#b8ba01", "#f4bfb1", "#ff28fd", "#f2cdff", "#009e7c",
    "#ff6200", "#56642a", "#953f1f", "#90318e", "#ff3464", "#a0e491",
    "#8c9ab1", "#829026", "#ae083f", "#77c6ba", "#bc9157", "#e48eff",
    "#72b8ff", "#c6a5c1", "#ff9070", "#d3c37c", "#bceddb", "#6b8567",
    "#916e56", "#f9ff00", "#bac1df", "#ac567c", "#ffcd03", "#ff49b1",
    "#c15603", "#5d8c8c", "#8d6c92", "#a04b56", "#cfaf45", "#7e7eb8",
    "#01c1cf", "#727c71", "#8a1d4a", "#3a39c4", "#f0d4ec", "#cd0072",
    "#bbb0bc", "#a3aa45", "#7e6f00", "#0085ff", "#5a3500", "#a89c5e",
    "#dc8e7c", "#697ed5", "#a45d9a", "#83a3a4", "#76bf65", "#5e76bf",
    "#e3e0b1", "#9b9266", "#a76b00", "#56423d", "#fa8aa4", "#aa6b8a",
    "#92dfa6", "#bd58b1",
];

let colorCursor = 0;

export const getRandomColor = (): string => {
    const color = TOKEN_COLOR_PALETTE[colorCursor % TOKEN_COLOR_PALETTE.length];
    colorCursor += 1;
    return color;
};

export const resetColorCycle = (): void => {
    colorCursor = 0;
};
