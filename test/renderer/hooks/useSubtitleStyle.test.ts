// @vitest-environment jsdom
import { createRef, type RefObject } from 'react';
import { act, renderHook } from '@testing-library/react';
import { useSubtitleStyle } from '@renderer/hooks/useSubtitleStyle';

function makeVideo(): { video: HTMLVideoElement; ref: RefObject<HTMLVideoElement | null> } {
    const video = document.createElement('video');
    const ref = createRef<HTMLVideoElement>();
    (ref as { current: HTMLVideoElement | null }).current = video;
    return { video, ref };
}

beforeEach(() => {
    window.localStorage.clear();
});

describe('useSubtitleStyle', () => {
    it('starts with the defaults and leaves the theme in charge of the colors', () => {
        const { video, ref } = makeVideo();
        const { result } = renderHook(() => {
            return useSubtitleStyle(ref);
        });
        expect(result.current.scale).toBe(1);
        expect(result.current.color).toBe('theme');
        expect(result.current.background).toBe('dim');
        expect(video.style.getPropertyValue('--subtitle-scale')).toBe('1');
        expect(video.style.getPropertyValue('--subtitle-color')).toBe('');
        expect(video.style.getPropertyValue('--subtitle-background')).toBe('');
    });

    it('starts with what the viewer chose before', () => {
        window.localStorage.setItem('pullwave-subtitle-scale', '2');
        window.localStorage.setItem('pullwave-subtitle-color', 'cyan');
        window.localStorage.setItem('pullwave-subtitle-background', 'solid');
        const { video, ref } = makeVideo();
        const { result } = renderHook(() => {
            return useSubtitleStyle(ref);
        });
        expect(result.current).toMatchObject({ scale: 2, color: 'cyan', background: 'solid' });
        expect(video.style.getPropertyValue('--subtitle-scale')).toBe('2');
        expect(video.style.getPropertyValue('--subtitle-color')).toBe('#4dd0e1');
        expect(video.style.getPropertyValue('--subtitle-background')).toBe('#000000');
    });

    it('resizes by a step, remembers it and shows it on the video', () => {
        const { video, ref } = makeVideo();
        const { result } = renderHook(() => {
            return useSubtitleStyle(ref);
        });
        act(() => {
            result.current.resize(1);
        });
        expect(result.current.scale).toBe(1.25);
        expect(video.style.getPropertyValue('--subtitle-scale')).toBe('1.25');
        expect(window.localStorage.getItem('pullwave-subtitle-scale')).toBe('1.25');
        act(() => {
            result.current.resize(-1);
        });
        act(() => {
            result.current.resize(-1);
        });
        expect(result.current.scale).toBe(0.75);
    });

    it('changes the color and the background, remembers them and shows them on the video', () => {
        const { video, ref } = makeVideo();
        const { result } = renderHook(() => {
            return useSubtitleStyle(ref);
        });
        act(() => {
            result.current.changeColor('green');
            result.current.changeBackground('none');
        });
        expect(result.current).toMatchObject({ color: 'green', background: 'none' });
        expect(video.style.getPropertyValue('--subtitle-color')).toBe('#69f0ae');
        expect(video.style.getPropertyValue('--subtitle-background')).toBe('transparent');
        expect(window.localStorage.getItem('pullwave-subtitle-color')).toBe('green');
        expect(window.localStorage.getItem('pullwave-subtitle-background')).toBe('none');

        act(() => {
            result.current.changeColor('theme');
            result.current.changeBackground('dim');
        });
        expect(video.style.getPropertyValue('--subtitle-color')).toBe('');
        expect(video.style.getPropertyValue('--subtitle-background')).toBe('');
    });

    it('does not fail when there is no video yet', () => {
        const ref = createRef<HTMLVideoElement>();
        const { result } = renderHook(() => {
            return useSubtitleStyle(ref);
        });
        act(() => {
            result.current.changeColor('white');
        });
        expect(result.current.color).toBe('white');
    });
});
