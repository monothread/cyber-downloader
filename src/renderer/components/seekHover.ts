export interface SeekHover {
    // The moment of the video under the mouse, in seconds.
    time: number;
    // How far from the left of the timeline the mouse is, in pixels.
    offset: number;
}

// What is under the mouse on the timeline: null when the length of the video is not known or the timeline has no width.
export function seekHover(clientX: number, bar: { left: number; width: number }, duration: number): SeekHover | null {
    if (duration <= 0 || bar.width <= 0) {
        return null;
    }
    const offset = Math.min(bar.width, Math.max(0, clientX - bar.left));
    return { time: (offset / bar.width) * duration, offset };
}
