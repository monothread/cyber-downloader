// @vitest-environment jsdom
import { createRef, type RefObject } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VideoControls, formatClock, type SubtitleOption } from '@renderer/components/VideoControls';

interface Harness {
    video: HTMLVideoElement;
    ref: RefObject<HTMLVideoElement | null>;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    unmount: () => void;
    onSelectSubtitle: ReturnType<typeof vi.fn>;
}

const OPTIONS: SubtitleOption[] = [
    { id: 'default', label: 'English' },
    { id: 'subtitle-Japanese', label: 'Japanese' }
];

function setup(subtitles: SubtitleOption[] = OPTIONS, duration = 120, selected: string | null = 'default'): Harness {
    const video = document.createElement('video');
    Object.defineProperty(video, 'duration', { value: duration, configurable: true });
    const play = vi.fn(() => {
        Object.defineProperty(video, 'paused', { value: false, configurable: true });
        return Promise.resolve();
    });
    const pause = vi.fn(() => {
        Object.defineProperty(video, 'paused', { value: true, configurable: true });
    });
    video.play = play;
    video.pause = pause;
    const stage = document.createElement('div');
    stage.appendChild(video);
    document.body.appendChild(stage);
    const ref = createRef<HTMLVideoElement>();
    (ref as { current: HTMLVideoElement | null }).current = video;
    const onSelectSubtitle = vi.fn();
    const { unmount } = render(<VideoControls video={ref} subtitles={subtitles} selectedSubtitle={selected} onSelectSubtitle={onSelectSubtitle} />);
    return { video, ref, play, pause, unmount, onSelectSubtitle };
}

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    document.body.innerHTML = '';
});

describe('formatClock', () => {
    it.each([
        [0, '0:00'],
        [5, '0:05'],
        [65, '1:05'],
        [600, '10:00'],
        [3600, '1:00:00'],
        [3725.9, '1:02:05'],
        [Number.NaN, '0:00'],
        [Number.POSITIVE_INFINITY, '0:00'],
        [-4, '0:00']
    ])('formats %s as %s', (seconds, expected) => {
        expect(formatClock(seconds)).toBe(expected);
    });
});

describe('VideoControls', () => {
    it('starts paused at 0:00 with the duration of the video', () => {
        setup();
        expect(screen.getByRole('button', { name: 'Play' })).toHaveTextContent('▶');
        expect(screen.getAllByText('0:00')).toHaveLength(1);
        expect(screen.getByText('2:00')).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Seek' })).toHaveAttribute('max', '120');
        expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('1');
    });

    it('shows a zero duration while it is unknown', () => {
        setup(OPTIONS, Number.NaN);
        expect(screen.getAllByText('0:00')).toHaveLength(2);
        expect(screen.getByRole('slider', { name: 'Seek' })).toHaveAttribute('max', '0');
    });

    it('plays and pauses the video', async () => {
        const { video, play, pause } = setup();
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Play' }));
        expect(play).toHaveBeenCalledTimes(1);
        act(() => {
            fireEvent.play(video);
        });
        expect(screen.getByRole('button', { name: 'Pause' })).toHaveTextContent('❚❚');
        expect(document.querySelector('.player__controls')).toHaveAttribute('data-playing', 'true');

        await user.click(screen.getByRole('button', { name: 'Pause' }));
        expect(pause).toHaveBeenCalledTimes(1);
        act(() => {
            fireEvent.pause(video);
        });
        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
        expect(document.querySelector('.player__controls')).toHaveAttribute('data-playing', 'false');
    });

    it('ignores a play request the browser refuses', async () => {
        const { video, play } = setup();
        play.mockImplementationOnce(() => {
            return Promise.reject(new Error('NotAllowedError'));
        });
        await userEvent.setup().click(screen.getByRole('button', { name: 'Play' }));
        expect(play).toHaveBeenCalledTimes(1);
        expect(video.paused).toBe(true);
    });

    it('follows the playback time', () => {
        const { video } = setup();
        video.currentTime = 75;
        act(() => {
            fireEvent.timeUpdate(video);
        });
        expect(screen.getByText('1:15')).toBeInTheDocument();
        const seek = screen.getByRole('slider', { name: 'Seek' });
        expect(seek).toHaveValue('75');
        expect(seek.style.getPropertyValue('--progress')).toBe('62.5%');
    });

    it('seeks when the slider moves', () => {
        const { video } = setup();
        fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '42' } });
        expect(video.currentTime).toBe(42);
    });

    it.each([
        ['ArrowRight', 50, 55],
        ['ArrowLeft', 50, 45],
        ['ArrowLeft', 2, 0],
        ['ArrowRight', 118, 120]
    ])('moves 5 seconds with %s from %s to %s', (key, from, to) => {
        const { video } = setup();
        video.currentTime = from;
        act(() => {
            fireEvent.timeUpdate(video);
        });
        const keyEvent = fireEvent.keyDown(screen.getByRole('slider', { name: 'Seek' }), { key });
        expect(keyEvent).toBe(false);
        expect(video.currentTime).toBe(to);
    });

    it('leaves other keys alone, so Escape still closes the dialog', () => {
        const { video } = setup();
        video.currentTime = 10;
        act(() => {
            fireEvent.timeUpdate(video);
        });
        const notPrevented = fireEvent.keyDown(screen.getByRole('slider', { name: 'Seek' }), { key: 'Escape' });
        expect(notPrevented).toBe(true);
        expect(video.currentTime).toBe(10);
    });

    it('mutes and unmutes the video', async () => {
        const { video } = setup();
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Mute' }));
        expect(video.muted).toBe(true);
        act(() => {
            fireEvent(video, new Event('volumechange'));
        });
        expect(screen.getByRole('button', { name: 'Unmute' })).toHaveTextContent('🔇');
        expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('0');

        await user.click(screen.getByRole('button', { name: 'Unmute' }));
        expect(video.muted).toBe(false);
        act(() => {
            fireEvent(video, new Event('volumechange'));
        });
        expect(screen.getByRole('button', { name: 'Mute' })).toHaveTextContent('🔊');
        expect(screen.getByRole('slider', { name: 'Volume' })).toHaveValue('1');
    });

    it('changes the volume and mutes at zero', () => {
        const { video } = setup();
        const volume = screen.getByRole('slider', { name: 'Volume' });

        fireEvent.change(volume, { target: { value: '0.5' } });
        expect(video.volume).toBe(0.5);
        expect(video.muted).toBe(false);
        // jsdom does not fire the event the browser fires after a volume change.
        act(() => {
            fireEvent(video, new Event('volumechange'));
        });
        expect(volume.style.getPropertyValue('--progress')).toBe('50%');

        fireEvent.change(volume, { target: { value: '0' } });
        expect(video.volume).toBe(0);
        expect(video.muted).toBe(true);
        act(() => {
            fireEvent(video, new Event('volumechange'));
        });
        expect(screen.getByRole('button', { name: 'Unmute' })).toBeInTheDocument();
    });

    describe('subtitles', () => {
        it('lists the subtitles with an option to turn them off, and shows the selected one', () => {
            setup();
            const select = screen.getByRole('combobox', { name: 'Subtitles' });
            expect(select).toHaveValue('default');
            expect(
                within(select)
                    .getAllByRole('option')
                    .map((option) => {
                        return [option.getAttribute('value'), option.textContent];
                    })
            ).toEqual([
                ['off', 'Off'],
                ['default', 'English'],
                ['subtitle-Japanese', 'Japanese']
            ]);
        });

        it('shows "off" when no subtitle is selected', () => {
            setup(OPTIONS, 120, null);
            expect(screen.getByRole('combobox', { name: 'Subtitles' })).toHaveValue('off');
        });

        it('tells which subtitle was chosen, and null for off', async () => {
            const { onSelectSubtitle } = setup();
            const user = userEvent.setup();
            await user.selectOptions(screen.getByRole('combobox', { name: 'Subtitles' }), 'subtitle-Japanese');
            expect(onSelectSubtitle).toHaveBeenLastCalledWith('subtitle-Japanese');
            await user.selectOptions(screen.getByRole('combobox', { name: 'Subtitles' }), 'off');
            expect(onSelectSubtitle).toHaveBeenLastCalledWith(null);
            expect(onSelectSubtitle).toHaveBeenCalledTimes(2);
        });

        it('has no subtitle control when the video has no subtitles', () => {
            setup([]);
            expect(screen.queryByRole('combobox', { name: 'Subtitles' })).not.toBeInTheDocument();
        });

        it('shows the selected track and hides the others', () => {
            const { video, ref, unmount } = setup(OPTIONS, 120, 'subtitle-Japanese');
            const tracks = [{ id: 'default', mode: 'showing' }, { id: 'subtitle-Japanese', mode: 'disabled' }, { id: 'other', mode: 'showing' }];
            Object.defineProperty(video, 'textTracks', { value: tracks, configurable: true });
            unmount();
            render(<VideoControls video={ref} subtitles={OPTIONS} selectedSubtitle="subtitle-Japanese" onSelectSubtitle={vi.fn()} />);
            expect(
                tracks.map((track) => {
                    return [track.id, track.mode];
                })
            ).toEqual([
                ['default', 'disabled'],
                ['subtitle-Japanese', 'showing'],
                ['other', 'disabled']
            ]);
        });

        it('makes the subtitles bigger and smaller, remembers it and shows it on the video', async () => {
            const { video } = setup();
            const user = userEvent.setup();
            expect(video.style.getPropertyValue('--subtitle-scale')).toBe('1');
            expect(within(screen.getByRole('group', { name: 'Subtitle size' })).getByText('100%')).toBeInTheDocument();

            await user.click(screen.getByRole('button', { name: 'Larger subtitles' }));
            await user.click(screen.getByRole('button', { name: 'Larger subtitles' }));
            expect(video.style.getPropertyValue('--subtitle-scale')).toBe('1.5');
            expect(screen.getByText('150%')).toBeInTheDocument();
            expect(window.localStorage.getItem('pullwave-subtitle-scale')).toBe('1.5');

            await user.click(screen.getByRole('button', { name: 'Smaller subtitles' }));
            expect(video.style.getPropertyValue('--subtitle-scale')).toBe('1.25');
            expect(screen.getByText('125%')).toBeInTheDocument();
            expect(window.localStorage.getItem('pullwave-subtitle-scale')).toBe('1.25');
        });

        it('starts at the size the viewer chose before', () => {
            window.localStorage.setItem('pullwave-subtitle-scale', '2');
            const { video } = setup();
            expect(video.style.getPropertyValue('--subtitle-scale')).toBe('2');
            expect(screen.getByText('200%')).toBeInTheDocument();
        });

        it('stops at the smallest and the largest size', async () => {
            const user = userEvent.setup();
            window.localStorage.setItem('pullwave-subtitle-scale', '0.5');
            const { unmount } = setup();
            expect(screen.getByRole('button', { name: 'Smaller subtitles' })).toBeDisabled();
            expect(screen.getByRole('button', { name: 'Larger subtitles' })).toBeEnabled();
            unmount();
            document.body.innerHTML = '';

            window.localStorage.setItem('pullwave-subtitle-scale', '3');
            setup();
            expect(screen.getByRole('button', { name: 'Larger subtitles' })).toBeDisabled();
            expect(screen.getByRole('button', { name: 'Smaller subtitles' })).toBeEnabled();
            await user.click(screen.getByRole('button', { name: 'Larger subtitles' }));
            expect(screen.getByText('300%')).toBeInTheDocument();
        });

        it('has no size control when the video has no subtitles', () => {
            setup([]);
            expect(screen.queryByRole('group', { name: 'Subtitle size' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Larger subtitles' })).not.toBeInTheDocument();
        });

        it('hides every track when the subtitles are off', () => {
            const { video, ref, unmount } = setup();
            const tracks = [{ id: 'default', mode: 'showing' }, { id: 'subtitle-Japanese', mode: 'showing' }];
            Object.defineProperty(video, 'textTracks', { value: tracks, configurable: true });
            unmount();
            render(<VideoControls video={ref} subtitles={OPTIONS} selectedSubtitle={null} onSelectSubtitle={vi.fn()} />);
            expect(
                tracks.map((track) => {
                    return track.mode;
                })
            ).toEqual(['disabled', 'disabled']);
        });
    });

    it('enters and leaves fullscreen with the stage that holds the video and the controls', async () => {
        const { video } = setup();
        const stage = video.parentElement as HTMLElement;
        const requestFullscreen = vi.fn(() => {
            return Promise.resolve();
        });
        const exitFullscreen = vi.fn(() => {
            return Promise.resolve();
        });
        stage.requestFullscreen = requestFullscreen;
        document.exitFullscreen = exitFullscreen;
        const user = userEvent.setup();

        await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
        expect(requestFullscreen).toHaveBeenCalledTimes(1);
        expect(exitFullscreen).not.toHaveBeenCalled();

        Object.defineProperty(document, 'fullscreenElement', { value: stage, configurable: true });
        await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
        expect(exitFullscreen).toHaveBeenCalledTimes(1);
        expect(requestFullscreen).toHaveBeenCalledTimes(1);
        Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
    });

    describe('in fullscreen', () => {
        function controls(): HTMLElement {
            return document.querySelector('.player__controls') as HTMLElement;
        }

        afterEach(() => {
            Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
            vi.useRealTimers();
        });

        it('shows the controls and hides them after 3 seconds without mouse movement, showing them again on movement', () => {
            vi.useFakeTimers();
            const { video } = setup();
            const stage = video.parentElement as HTMLElement;
            expect(controls()).toHaveAttribute('data-hidden', 'false');

            Object.defineProperty(document, 'fullscreenElement', { value: stage, configurable: true });
            act(() => {
                document.dispatchEvent(new Event('fullscreenchange'));
            });
            expect(controls()).toHaveAttribute('data-hidden', 'false');
            act(() => {
                vi.advanceTimersByTime(3000);
            });
            expect(controls()).toHaveAttribute('data-hidden', 'true');

            act(() => {
                stage.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
            });
            expect(controls()).toHaveAttribute('data-hidden', 'false');
        });

        it('keeps the controls visible outside of fullscreen', () => {
            vi.useFakeTimers();
            setup();
            act(() => {
                vi.advanceTimersByTime(10000);
            });
            expect(controls()).toHaveAttribute('data-hidden', 'false');
        });
    });

    describe('clicking the video', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('plays or pauses after a single click', () => {
            const { video, play, pause } = setup();
            fireEvent.click(video);
            expect(play).not.toHaveBeenCalled();
            act(() => {
                vi.advanceTimersByTime(250);
            });
            expect(play).toHaveBeenCalledTimes(1);

            fireEvent.click(video);
            act(() => {
                vi.advanceTimersByTime(250);
            });
            expect(pause).toHaveBeenCalledTimes(1);
        });

        it('enters fullscreen on a double click without pausing or playing', () => {
            const { video, play, pause } = setup();
            const requestFullscreen = vi.fn(() => {
                return Promise.resolve();
            });
            (video.parentElement as HTMLElement).requestFullscreen = requestFullscreen;

            fireEvent.click(video);
            fireEvent.click(video);
            fireEvent.doubleClick(video);
            act(() => {
                vi.advanceTimersByTime(1000);
            });
            expect(requestFullscreen).toHaveBeenCalledTimes(1);
            expect(play).not.toHaveBeenCalled();
            expect(pause).not.toHaveBeenCalled();
        });

        it('leaves fullscreen on a double click while in fullscreen', () => {
            const { video } = setup();
            const exitFullscreen = vi.fn(() => {
                return Promise.resolve();
            });
            document.exitFullscreen = exitFullscreen;
            Object.defineProperty(document, 'fullscreenElement', { value: video.parentElement, configurable: true });
            fireEvent.doubleClick(video);
            expect(exitFullscreen).toHaveBeenCalledTimes(1);
            Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
        });

        it('drops a pending click when the controls are removed', () => {
            const { video, play, unmount } = setup();
            fireEvent.click(video);
            unmount();
            act(() => {
                vi.advanceTimersByTime(1000);
            });
            expect(play).not.toHaveBeenCalled();
        });
    });

    it('does nothing when the video is gone', async () => {
        const { ref } = setup();
        (ref as { current: HTMLVideoElement | null }).current = null;
        const user = userEvent.setup();
        await user.click(screen.getByRole('button', { name: 'Play' }));
        await user.click(screen.getByRole('button', { name: 'Mute' }));
        await user.click(screen.getByRole('button', { name: 'Fullscreen' }));
        fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '10' } });
        fireEvent.change(screen.getByRole('slider', { name: 'Volume' }), { target: { value: '0.2' } });
        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });

    it('stops listening to the video when it is removed', () => {
        const { video, unmount } = setup();
        const add = vi.spyOn(video, 'addEventListener');
        const remove = vi.spyOn(video, 'removeEventListener');
        unmount();
        expect(remove.mock.calls.map((call) => {
            return call[0];
        })).toEqual(['play', 'pause', 'timeupdate', 'durationchange', 'loadedmetadata', 'volumechange', 'seeked', 'ended', 'click', 'dblclick']);
        expect(add).not.toHaveBeenCalled();
    });
});
