// @vitest-environment jsdom
import { createRef, type RefObject } from 'react';
import { act, renderHook } from '@testing-library/react';
import { bufferedEnd, bufferedPercentOf, LOADING_DELAY_MS, useVideoBuffer } from '@renderer/hooks/useVideoBuffer';

interface Range {
    start: number;
    end: number;
}

function ranges(list: Range[]): TimeRanges {
    return {
        length: list.length,
        start: (index: number) => {
            return (list[index] as Range).start;
        },
        end: (index: number) => {
            return (list[index] as Range).end;
        }
    };
}

function makeVideo(duration = 200, currentTime = 0, buffered: Range[] = []): { video: HTMLVideoElement; ref: RefObject<HTMLVideoElement | null> } {
    const video = document.createElement('video');
    Object.defineProperty(video, 'duration', { value: duration, configurable: true });
    Object.defineProperty(video, 'currentTime', { value: currentTime, writable: true, configurable: true });
    Object.defineProperty(video, 'buffered', { value: ranges(buffered), configurable: true });
    const ref = createRef<HTMLVideoElement>();
    (ref as { current: HTMLVideoElement | null }).current = video;
    return { video, ref };
}

function emit(video: HTMLVideoElement, ...names: string[]): void {
    act(() => {
        names.forEach((name) => {
            video.dispatchEvent(new Event(name));
        });
    });
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('bufferedEnd', () => {
    it('gives the end of the stretch that holds the current time', () => {
        const list = ranges([{ start: 0, end: 30 }, { start: 100, end: 160 }]);
        expect(bufferedEnd(list, 10)).toBe(30);
        expect(bufferedEnd(list, 100)).toBe(160);
        expect(bufferedEnd(list, 160)).toBe(160);
    });

    it('gives 0 when the current time is not loaded or nothing is', () => {
        expect(bufferedEnd(ranges([{ start: 0, end: 30 }]), 50)).toBe(0);
        expect(bufferedEnd(ranges([]), 0)).toBe(0);
    });
});

describe('bufferedPercentOf', () => {
    it('gives the loaded part as a percent of the video', () => {
        expect(bufferedPercentOf(makeVideo(200, 20, [{ start: 0, end: 100 }]).video)).toBe(50);
    });

    it('never goes past 100', () => {
        expect(bufferedPercentOf(makeVideo(100, 0, [{ start: 0, end: 120 }]).video)).toBe(100);
    });

    it.each([[0], [Infinity], [NaN]])('gives 0 when the length is %s', (duration) => {
        expect(bufferedPercentOf(makeVideo(duration, 0, [{ start: 0, end: 10 }]).video)).toBe(0);
    });
});

describe('useVideoBuffer', () => {
    it('waits 150 ms', () => {
        expect(LOADING_DELAY_MS).toBe(150);
    });

    it('starts not loading and with the loaded part it already has', () => {
        const { ref } = makeVideo(200, 0, [{ start: 0, end: 40 }]);
        const { result } = renderHook(() => {
            return useVideoBuffer(ref);
        });
        expect(result.current).toEqual({ loading: false, bufferedPercent: 20 });
    });

    it.each([['seeking'], ['waiting']])('says it is loading when "%s" lasts the delay, and stops when the video plays', (name) => {
        const { video, ref } = makeVideo();
        const { result } = renderHook(() => {
            return useVideoBuffer(ref);
        });
        emit(video, name);
        act(() => {
            vi.advanceTimersByTime(LOADING_DELAY_MS - 1);
        });
        expect(result.current.loading).toBe(false);
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current.loading).toBe(true);
        emit(video, 'playing');
        expect(result.current.loading).toBe(false);
    });

    it.each([['playing'], ['seeked'], ['canplay'], ['emptied'], ['error']])('does not say it is loading when "%s" comes before the delay', (name) => {
        const { video, ref } = makeVideo();
        const { result } = renderHook(() => {
            return useVideoBuffer(ref);
        });
        emit(video, 'seeking', 'waiting');
        emit(video, name);
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.loading).toBe(false);
    });

    it('counts the delay from the first wait, not from each one', () => {
        const { video, ref } = makeVideo();
        const { result } = renderHook(() => {
            return useVideoBuffer(ref);
        });
        emit(video, 'seeking');
        act(() => {
            vi.advanceTimersByTime(100);
        });
        emit(video, 'waiting');
        act(() => {
            vi.advanceTimersByTime(50);
        });
        expect(result.current.loading).toBe(true);
    });

    it('follows how far the video is loaded', () => {
        const { video, ref } = makeVideo(200, 0, [{ start: 0, end: 20 }]);
        const { result } = renderHook(() => {
            return useVideoBuffer(ref);
        });
        expect(result.current.bufferedPercent).toBe(10);
        Object.defineProperty(video, 'buffered', { value: ranges([{ start: 0, end: 60 }]), configurable: true });
        emit(video, 'progress');
        expect(result.current.bufferedPercent).toBe(30);
        Object.defineProperty(video, 'currentTime', { value: 150, configurable: true });
        emit(video, 'seeked');
        expect(result.current.bufferedPercent).toBe(0);
    });

    it('stops listening and waiting when it is removed', () => {
        const { video, ref } = makeVideo();
        const { result, unmount } = renderHook(() => {
            return useVideoBuffer(ref);
        });
        emit(video, 'waiting');
        const remove = vi.spyOn(video, 'removeEventListener');
        unmount();
        expect(
            remove.mock.calls.map((call) => {
                return call[0];
            })
        ).toEqual(['seeking', 'waiting', 'playing', 'seeked', 'canplay', 'emptied', 'error', 'progress', 'timeupdate', 'seeked', 'loadedmetadata', 'durationchange', 'emptied']);
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.loading).toBe(false);
    });

    it('does not fail when there is no video yet', () => {
        const ref = createRef<HTMLVideoElement>();
        const { result } = renderHook(() => {
            return useVideoBuffer(ref);
        });
        expect(result.current).toEqual({ loading: false, bufferedPercent: 0 });
    });
});
