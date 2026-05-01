export type SmoothAnimationState = {
    currentFps: number;
    minFps: number;
    maxFps: number;
    averageFps: number;
    fpsHistory: number[];
};

export const INITIAL_SMOOTH_ANIMATION_STATE: SmoothAnimationState = {
    currentFps: 0,
    minFps: Infinity,
    maxFps: 0,
    averageFps: 0,
    fpsHistory: [],
};
