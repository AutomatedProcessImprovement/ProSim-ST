type TouchCanvas = {
    scroll: (delta: {dx: number; dy: number}) => void;
    zoom: (scale?: number, center?: {x: number; y: number}) => number;
};

const MIN_SCALE = 0.1;
const MAX_SCALE = 3;

export function enableTouchNavigation(container: HTMLElement, canvas: TouchCanvas) {
    let last: {x: number; y: number; spread: number} | null = null;

    const read = (touches: TouchList) => {
        const [first, second = first] = Array.from(touches);
        const {left, top} = container.getBoundingClientRect();
        return {
            x: (first.clientX + second.clientX) / 2 - left,
            y: (first.clientY + second.clientY) / 2 - top,
            spread: Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY),
        };
    };

    const start = (event: TouchEvent) => { last = read(event.touches); };

    const move = (event: TouchEvent) => {
        if (!last || !event.touches.length) return;
        event.preventDefault();
        const next = read(event.touches);
        canvas.scroll({dx: next.x - last.x, dy: next.y - last.y});
        if (next.spread && last.spread) {
            const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, canvas.zoom() * next.spread / last.spread));
            canvas.zoom(scale, {x: next.x, y: next.y});
        }
        last = next;
    };

    const end = (event: TouchEvent) => { last = event.touches.length ? read(event.touches) : null; };

    container.addEventListener("touchstart", start, {passive: true});
    container.addEventListener("touchmove", move, {passive: false});
    container.addEventListener("touchend", end);
    container.addEventListener("touchcancel", end);
}
