// @vitest-environment jsdom
import { createRef, type RefObject } from 'react';
import { act, renderHook } from '@testing-library/react';
import { CONTROLS_IDLE_MS, useFullscreenIdle } from '@renderer/hooks/useFullscreenIdle';

interface Harness {
    stage: HTMLDivElement;
    ref: RefObject<HTMLVideoElement | null>;
}

function makeHarness(): Harness {
    const stage = document.createElement('div');
    const video = document.createElement('video');
    stage.appendChild(video);
    document.body.appendChild(stage);
    const ref = createRef<HTMLVideoElement>();
    (ref as { current: HTMLVideoElement | null }).current = video;
    return { stage, ref };
}

function setFullscreenElement(element: Element | null): void {
    Object.defineProperty(document, 'fullscreenElement', { value: element, configurable: true });
    act(() => {
        document.dispatchEvent(new Event('fullscreenchange'));
    });
}

function moveMouse(stage: HTMLElement): void {
    act(() => {
        stage.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    });
}

function advance(ms: number): void {
    act(() => {
        vi.advanceTimersByTime(ms);
    });
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    document.body.innerHTML = '';
    vi.useRealTimers();
});

describe('useFullscreenIdle', () => {
    it('waits 3 seconds', () => {
        expect(CONTROLS_IDLE_MS).toBe(3000);
    });

    it('keeps the controls visible outside of fullscreen, however long the mouse stands still', () => {
        const { stage, ref } = makeHarness();
        const { result } = renderHook(() => {
            return useFullscreenIdle(ref);
        });
        moveMouse(stage);
        advance(CONTROLS_IDLE_MS * 3);
        expect(result.current).toBe(false);
    });

    it('hides the controls after 3 seconds without mouse movement in fullscreen', () => {
        const { stage, ref } = makeHarness();
        const { result } = renderHook(() => {
            return useFullscreenIdle(ref);
        });
        setFullscreenElement(stage);

        advance(CONTROLS_IDLE_MS - 1);
        expect(result.current).toBe(false);
        advance(1);
        expect(result.current).toBe(true);
    });

    it('shows the controls again when the mouse moves and hides them after another 3 seconds', () => {
        const { stage, ref } = makeHarness();
        const { result } = renderHook(() => {
            return useFullscreenIdle(ref);
        });
        setFullscreenElement(stage);
        advance(CONTROLS_IDLE_MS);
        expect(result.current).toBe(true);

        moveMouse(stage);
        expect(result.current).toBe(false);
        advance(CONTROLS_IDLE_MS - 1);
        expect(result.current).toBe(false);
        advance(1);
        expect(result.current).toBe(true);
    });

    it('restarts the countdown on every mouse movement', () => {
        const { stage, ref } = makeHarness();
        const { result } = renderHook(() => {
            return useFullscreenIdle(ref);
        });
        setFullscreenElement(stage);

        advance(2000);
        moveMouse(stage);
        advance(2000);
        expect(result.current).toBe(false);
        advance(1000);
        expect(result.current).toBe(true);
    });

    it('shows the controls and stops counting when fullscreen ends', () => {
        const { stage, ref } = makeHarness();
        const { result } = renderHook(() => {
            return useFullscreenIdle(ref);
        });
        setFullscreenElement(stage);
        advance(CONTROLS_IDLE_MS);
        expect(result.current).toBe(true);

        setFullscreenElement(null);
        expect(result.current).toBe(false);
        moveMouse(stage);
        advance(CONTROLS_IDLE_MS * 2);
        expect(result.current).toBe(false);
    });

    it('cancels a countdown in progress when fullscreen ends', () => {
        const { stage, ref } = makeHarness();
        const { result } = renderHook(() => {
            return useFullscreenIdle(ref);
        });
        setFullscreenElement(stage);
        advance(1000);
        setFullscreenElement(null);
        advance(CONTROLS_IDLE_MS);
        expect(result.current).toBe(false);
    });

    it('ignores another element in fullscreen', () => {
        const { ref } = makeHarness();
        const other = document.createElement('div');
        document.body.appendChild(other);
        const { result } = renderHook(() => {
            return useFullscreenIdle(ref);
        });
        setFullscreenElement(other);
        advance(CONTROLS_IDLE_MS * 2);
        expect(result.current).toBe(false);
    });

    it('starts the countdown when the page is already in fullscreen with the stage', () => {
        const { stage, ref } = makeHarness();
        Object.defineProperty(document, 'fullscreenElement', { value: stage, configurable: true });
        const { result } = renderHook(() => {
            return useFullscreenIdle(ref);
        });
        expect(result.current).toBe(false);
        advance(CONTROLS_IDLE_MS);
        expect(result.current).toBe(true);
    });

    it('does nothing when the video is gone', () => {
        const { ref } = makeHarness();
        (ref as { current: HTMLVideoElement | null }).current = null;
        const add = vi.spyOn(document, 'addEventListener');
        const { result } = renderHook(() => {
            return useFullscreenIdle(ref);
        });
        expect(result.current).toBe(false);
        expect(add).not.toHaveBeenCalled();
    });

    it('stops listening and counting when it is removed', () => {
        const { stage, ref } = makeHarness();
        const removeDocument = vi.spyOn(document, 'removeEventListener');
        const removeStage = vi.spyOn(stage, 'removeEventListener');
        const { unmount } = renderHook(() => {
            return useFullscreenIdle(ref);
        });
        setFullscreenElement(stage);
        removeStage.mockClear();
        unmount();

        expect(removeDocument).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
        expect(removeStage).toHaveBeenCalledWith('mousemove', expect.any(Function));
        expect(vi.getTimerCount()).toBe(0);
    });
});
