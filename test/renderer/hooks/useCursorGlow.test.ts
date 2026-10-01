// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { CURSOR_GLOW_ATTRIBUTE, CURSOR_X_VARIABLE, CURSOR_Y_VARIABLE, REDUCED_MOTION_QUERY, useCursorGlow } from '@renderer/hooks/useCursorGlow';

const FRAME_MS = 16;
const root = document.documentElement;

function mockReducedMotion(reduced: boolean): ReturnType<typeof vi.fn> {
    const matchMedia = vi.fn((query: string) => {
        return { matches: reduced && query === REDUCED_MOTION_QUERY } as MediaQueryList;
    });
    vi.stubGlobal('matchMedia', matchMedia);
    window.matchMedia = matchMedia;
    return matchMedia;
}

function moveMouse(x: number, y: number): void {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y }));
}

function nextFrame(): void {
    act(() => {
        vi.advanceTimersByTime(FRAME_MS);
    });
}

function glowState(): { x: string; y: string; glow: string | null } {
    return {
        x: root.style.getPropertyValue(CURSOR_X_VARIABLE),
        y: root.style.getPropertyValue(CURSOR_Y_VARIABLE),
        glow: root.getAttribute(CURSOR_GLOW_ATTRIBUTE)
    };
}

beforeEach(() => {
    vi.useFakeTimers();
    mockReducedMotion(false);
});

afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    root.removeAttribute(CURSOR_GLOW_ATTRIBUTE);
    root.style.removeProperty(CURSOR_X_VARIABLE);
    root.style.removeProperty(CURSOR_Y_VARIABLE);
});

describe('useCursorGlow', () => {
    it('does nothing while disabled', () => {
        renderHook(() => {
            useCursorGlow(false);
        });
        moveMouse(10, 20);
        nextFrame();
        expect(glowState()).toEqual({ x: '', y: '', glow: null });
    });

    it('follows the mouse once enabled and turns the glow on', () => {
        renderHook(() => {
            useCursorGlow(true);
        });
        expect(glowState()).toEqual({ x: '', y: '', glow: null });
        moveMouse(120, 240);
        nextFrame();
        expect(glowState()).toEqual({ x: '120px', y: '240px', glow: 'on' });
        moveMouse(5, 6);
        nextFrame();
        expect(glowState()).toEqual({ x: '5px', y: '6px', glow: 'on' });
    });

    it('batches several moves into one update per frame with the last position', () => {
        const setProperty = vi.spyOn(root.style, 'setProperty');
        renderHook(() => {
            useCursorGlow(true);
        });
        moveMouse(1, 1);
        moveMouse(2, 2);
        moveMouse(300, 400);
        expect(setProperty).not.toHaveBeenCalled();
        nextFrame();
        expect(setProperty).toHaveBeenCalledTimes(2);
        expect(setProperty).toHaveBeenNthCalledWith(1, CURSOR_X_VARIABLE, '300px');
        expect(setProperty).toHaveBeenNthCalledWith(2, CURSOR_Y_VARIABLE, '400px');
    });

    it('turns the glow off when the mouse leaves the window', () => {
        renderHook(() => {
            useCursorGlow(true);
        });
        moveMouse(50, 60);
        nextFrame();
        expect(glowState().glow).toBe('on');
        root.dispatchEvent(new MouseEvent('mouseleave'));
        expect(glowState()).toEqual({ x: '50px', y: '60px', glow: null });
        moveMouse(70, 80);
        nextFrame();
        expect(glowState()).toEqual({ x: '70px', y: '80px', glow: 'on' });
    });

    it('cleans up when it is disabled', () => {
        const { rerender } = renderHook(
            ({ enabled }: { enabled: boolean }) => {
                useCursorGlow(enabled);
            },
            { initialProps: { enabled: true } }
        );
        moveMouse(50, 60);
        nextFrame();
        rerender({ enabled: false });
        expect(glowState()).toEqual({ x: '', y: '', glow: null });
        moveMouse(90, 90);
        nextFrame();
        expect(glowState()).toEqual({ x: '', y: '', glow: null });
    });

    it('cancels the pending frame and removes its listeners on unmount', () => {
        const removeWindow = vi.spyOn(window, 'removeEventListener');
        const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');
        const { unmount } = renderHook(() => {
            useCursorGlow(true);
        });
        moveMouse(10, 10);
        unmount();
        expect(cancelFrame).toHaveBeenCalledTimes(1);
        expect(removeWindow).toHaveBeenCalledWith('pointermove', expect.any(Function));
        nextFrame();
        expect(glowState()).toEqual({ x: '', y: '', glow: null });
    });

    it('does not cancel a frame when none is pending', () => {
        const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame');
        const { unmount } = renderHook(() => {
            useCursorGlow(true);
        });
        unmount();
        expect(cancelFrame).not.toHaveBeenCalled();
    });

    it('stays still for people who prefer reduced motion', () => {
        const matchMedia = mockReducedMotion(true);
        renderHook(() => {
            useCursorGlow(true);
        });
        expect(matchMedia).toHaveBeenCalledWith(REDUCED_MOTION_QUERY);
        moveMouse(10, 20);
        nextFrame();
        expect(glowState()).toEqual({ x: '', y: '', glow: null });
    });

    it('works when matchMedia does not exist', () => {
        vi.stubGlobal('matchMedia', undefined);
        window.matchMedia = undefined as unknown as typeof window.matchMedia;
        renderHook(() => {
            useCursorGlow(true);
        });
        moveMouse(15, 25);
        nextFrame();
        expect(glowState()).toEqual({ x: '15px', y: '25px', glow: 'on' });
    });
});
