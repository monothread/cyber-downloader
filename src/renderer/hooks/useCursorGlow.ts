import { useEffect } from 'react';

export const CURSOR_X_VARIABLE = '--mx';
export const CURSOR_Y_VARIABLE = '--my';
export const CURSOR_GLOW_ATTRIBUTE = 'data-glow';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function prefersReducedMotion(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function hideGlow(root: HTMLElement): void {
    root.removeAttribute(CURSOR_GLOW_ATTRIBUTE);
}

// Moves a neon glow (drawn by the cyberpunk stylesheet) along with the mouse. Positions are batched to one update per frame.
export function useCursorGlow(enabled: boolean): void {
    useEffect(() => {
        if (!enabled || prefersReducedMotion()) {
            return undefined;
        }
        const root = document.documentElement;
        let frame: number | null = null;
        let position = { x: 0, y: 0 };

        const paint = (): void => {
            frame = null;
            root.style.setProperty(CURSOR_X_VARIABLE, `${position.x}px`);
            root.style.setProperty(CURSOR_Y_VARIABLE, `${position.y}px`);
            root.setAttribute(CURSOR_GLOW_ATTRIBUTE, 'on');
        };
        const follow = (event: PointerEvent): void => {
            position = { x: event.clientX, y: event.clientY };
            if (frame === null) {
                frame = window.requestAnimationFrame(paint);
            }
        };
        const leave = (): void => {
            hideGlow(root);
        };

        window.addEventListener('pointermove', follow);
        document.documentElement.addEventListener('mouseleave', leave);
        return () => {
            window.removeEventListener('pointermove', follow);
            document.documentElement.removeEventListener('mouseleave', leave);
            if (frame !== null) {
                window.cancelAnimationFrame(frame);
            }
            hideGlow(root);
            root.style.removeProperty(CURSOR_X_VARIABLE);
            root.style.removeProperty(CURSOR_Y_VARIABLE);
        };
    }, [enabled]);
}
