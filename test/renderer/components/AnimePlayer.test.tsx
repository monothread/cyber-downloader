// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnimeSubtitleTrack } from '@shared/anime';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { AnimePlayer, SAVE_INTERVAL_SECONDS } from '@renderer/components/AnimePlayer';
import { INITIAL_SEARCH, UNSUPPORTED_STATUS, useAnimeStore } from '@renderer/store/animeStore';
import { useAppStore } from '@renderer/store/appStore';
import { makeAnime, makeEpisode } from '../../helpers/animeFixtures';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initialApp = useAppStore.getState();
const initialAnime = useAnimeStore.getState();

const FIRST = makeEpisode({ id: 1, number: '1', positionSeconds: 600, durationSeconds: 1440 });
const SECOND = makeEpisode({ id: 2, number: '2' });
const THIRD = makeEpisode({ id: 3, number: '3', status: 'queued', filePath: null });
const ANIME = makeAnime([FIRST, SECOND, THIRD], { id: 5, title: 'Naruto' });

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initialApp, settings: DEFAULT_SETTINGS });
    useAnimeStore.setState({ ...initialAnime, status: UNSUPPORTED_STATUS, jobs: [], library: [ANIME], search: INITIAL_SEARCH, selection: null, playing: { animeId: 5, episodeId: 1 } });
    mock.api.listAnimeLibrary.mockResolvedValue([ANIME]);
    mock.api.listAnimeSubtitles.mockResolvedValue([{ id: '', label: 'English', kind: 'default' }]);
    window.localStorage.clear();
});

const JAPANESE: AnimeSubtitleTrack = { id: 'subtitle-Japanese', label: 'Japanese', kind: 'source' };
const IMPORTED: AnimeSubtitleTrack = { id: 'import-aula', label: 'aula', kind: 'imported' };
const ENGLISH: AnimeSubtitleTrack = { id: '', label: 'English', kind: 'default' };

function trackElements(): HTMLTrackElement[] {
    return Array.from(document.querySelectorAll('track'));
}

function getVideo(): HTMLVideoElement {
    const video = document.querySelector('video');
    if (!video) {
        throw new Error('No video');
    }
    return video;
}

function setPlayback(video: HTMLVideoElement, currentTime: number, duration: number): void {
    Object.defineProperty(video, 'duration', { value: duration, configurable: true });
    video.currentTime = currentTime;
}

describe('AnimePlayer', () => {
    it('renders nothing when nothing is playing', () => {
        useAnimeStore.setState({ playing: null });
        const { container } = render(<AnimePlayer />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders nothing when the episode is no longer in the library', () => {
        useAnimeStore.setState({ playing: { animeId: 5, episodeId: 99 } });
        const { container } = render(<AnimePlayer />);
        expect(container).toBeEmptyDOMElement();
        useAnimeStore.setState({ playing: { animeId: 77, episodeId: 1 } });
        expect(container).toBeEmptyDOMElement();
    });

    it('opens a dialog with the video of the episode and its subtitles', () => {
        render(<AnimePlayer />);
        const dialog = screen.getByRole('dialog', { name: 'Naruto · EP 1' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByRole('heading', { name: 'Naruto · EP 1' })).toBeInTheDocument();

        const video = getVideo();
        expect(video).toHaveAttribute('src', 'pullwave-media://episode/1');
        expect(video).toHaveAttribute('crossorigin', 'anonymous');
        expect(video.controls).toBe(false);
        expect(video.autoplay).toBe(true);
        expect(video.parentElement).toHaveClass('player__stage');
        expect(video.nextElementSibling).toHaveClass('player__controls');
        expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
        expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Subtitles' })).toHaveValue('default');
        expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
        const track = video.querySelector('track');
        expect(track).toHaveAttribute('src', 'pullwave-media://subtitle/1');
        expect(track).toHaveAttribute('kind', 'subtitles');
        expect(track).toHaveAttribute('label', 'Subtitles');
        expect(track).toHaveAttribute('id', 'default');
        expect(track?.hasAttribute('default')).toBe(true);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('focuses the close button', () => {
        render(<AnimePlayer />);
        expect(screen.getByRole('button', { name: 'CLOSE' })).toHaveFocus();
    });

    it('resumes where the episode stopped', () => {
        render(<AnimePlayer />);
        const video = getVideo();
        fireEvent.loadedMetadata(video);
        expect(video.currentTime).toBe(600);
    });

    it('starts from the beginning when there is nothing to resume', () => {
        useAnimeStore.setState({ playing: { animeId: 5, episodeId: 2 } });
        render(<AnimePlayer />);
        const video = getVideo();
        fireEvent.loadedMetadata(video);
        expect(video.currentTime).toBe(0);
    });

    describe('saving the progress', () => {
        it('saves every few seconds while it plays', () => {
            render(<AnimePlayer />);
            const video = getVideo();
            setPlayback(video, 100, 1440);
            fireEvent.timeUpdate(video);
            expect(mock.api.saveAnimeProgress).toHaveBeenCalledTimes(1);
            expect(mock.api.saveAnimeProgress).toHaveBeenLastCalledWith({ episodeId: 1, positionSeconds: 100, durationSeconds: 1440, watched: false });

            setPlayback(video, 100 + SAVE_INTERVAL_SECONDS - 1, 1440);
            fireEvent.timeUpdate(video);
            expect(mock.api.saveAnimeProgress).toHaveBeenCalledTimes(1);

            setPlayback(video, 100 + SAVE_INTERVAL_SECONDS, 1440);
            fireEvent.timeUpdate(video);
            expect(mock.api.saveAnimeProgress).toHaveBeenCalledTimes(2);
            expect(mock.api.saveAnimeProgress).toHaveBeenLastCalledWith({ episodeId: 1, positionSeconds: 105, durationSeconds: 1440, watched: false });
        });

        it('also saves when it is paused and when it ends, marking it watched near the end', () => {
            render(<AnimePlayer />);
            const video = getVideo();
            setPlayback(video, 300, 1440);
            fireEvent.pause(video);
            expect(mock.api.saveAnimeProgress).toHaveBeenLastCalledWith({ episodeId: 1, positionSeconds: 300, durationSeconds: 1440, watched: false });

            setPlayback(video, 1440, 1440);
            fireEvent.ended(video);
            expect(mock.api.saveAnimeProgress).toHaveBeenLastCalledWith({ episodeId: 1, positionSeconds: 1440, durationSeconds: 1440, watched: true });
        });

        it('counts the episode as watched once 75 percent of it was seen, and not before', () => {
            render(<AnimePlayer />);
            const video = getVideo();
            setPlayback(video, 1079, 1440);
            fireEvent.pause(video);
            expect(mock.api.saveAnimeProgress).toHaveBeenLastCalledWith({ episodeId: 1, positionSeconds: 1079, durationSeconds: 1440, watched: false });

            setPlayback(video, 1080, 1440);
            fireEvent.pause(video);
            expect(mock.api.saveAnimeProgress).toHaveBeenLastCalledWith({ episodeId: 1, positionSeconds: 1080, durationSeconds: 1440, watched: true });
        });

        it('keeps an episode that was already watched as watched when it is watched again from the start', () => {
            useAnimeStore.setState({ library: [makeAnime([makeEpisode({ id: 1, number: '1', watched: true, positionSeconds: 1400, durationSeconds: 1440 })], { id: 5, title: 'Naruto' })] });
            render(<AnimePlayer />);
            const video = getVideo();
            setPlayback(video, 100, 1440);
            fireEvent.pause(video);
            expect(mock.api.saveAnimeProgress).toHaveBeenLastCalledWith({ episodeId: 1, positionSeconds: 100, durationSeconds: 1440, watched: true });
        });

        it('does not save before the duration is known', () => {
            render(<AnimePlayer />);
            const video = getVideo();
            Object.defineProperty(video, 'duration', { value: Number.NaN, configurable: true });
            fireEvent.pause(video);
            expect(mock.api.saveAnimeProgress).not.toHaveBeenCalled();
        });
    });

    describe('closing', () => {
        it('saves, closes and refreshes the library', async () => {
            const user = userEvent.setup();
            render(<AnimePlayer />);
            setPlayback(getVideo(), 700, 1440);

            await user.click(screen.getByRole('button', { name: 'CLOSE' }));

            expect(mock.api.saveAnimeProgress).toHaveBeenCalledWith({ episodeId: 1, positionSeconds: 700, durationSeconds: 1440, watched: false });
            expect(useAnimeStore.getState().playing).toBeNull();
            expect(mock.api.listAnimeLibrary).toHaveBeenCalledTimes(1);
        });

        it('closes with Escape and ignores other keys', () => {
            render(<AnimePlayer />);
            setPlayback(getVideo(), 10, 1440);
            fireEvent.keyDown(window, { key: 'Enter' });
            expect(useAnimeStore.getState().playing).not.toBeNull();

            act(() => {
                fireEvent.keyDown(window, { key: 'Escape' });
            });
            expect(useAnimeStore.getState().playing).toBeNull();
            expect(mock.api.saveAnimeProgress).toHaveBeenCalledTimes(1);
        });

        it('stops listening for Escape once it is gone', () => {
            const { unmount } = render(<AnimePlayer />);
            unmount();
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(mock.api.saveAnimeProgress).not.toHaveBeenCalled();
        });
    });

    describe('next episode', () => {
        it('offers the next one when it is downloaded and plays it', async () => {
            const user = userEvent.setup();
            render(<AnimePlayer />);
            setPlayback(getVideo(), 900, 1440);

            await user.click(screen.getByRole('button', { name: 'NEXT EPISODE' }));

            expect(mock.api.saveAnimeProgress).toHaveBeenCalledWith({ episodeId: 1, positionSeconds: 900, durationSeconds: 1440, watched: false });
            expect(useAnimeStore.getState().playing).toEqual({ animeId: 5, episodeId: 2 });
        });

        it('starts the new episode on a fresh video', async () => {
            const user = userEvent.setup();
            render(<AnimePlayer />);
            const first = getVideo();
            await user.click(screen.getByRole('button', { name: 'NEXT EPISODE' }));
            const second = getVideo();
            expect(second).not.toBe(first);
            expect(second).toHaveAttribute('src', 'pullwave-media://episode/2');
            expect(screen.getByRole('dialog', { name: 'Naruto · EP 2' })).toBeInTheDocument();
        });

        it('does not offer it when the next episode is not downloaded or there is none', () => {
            useAnimeStore.setState({ playing: { animeId: 5, episodeId: 2 } });
            const { unmount } = render(<AnimePlayer />);
            expect(screen.queryByRole('button', { name: 'NEXT EPISODE' })).not.toBeInTheDocument();
            unmount();

            useAnimeStore.setState({ library: [makeAnime([SECOND], { id: 5 })], playing: { animeId: 5, episodeId: 2 } });
            render(<AnimePlayer />);
            expect(screen.queryByRole('button', { name: 'NEXT EPISODE' })).not.toBeInTheDocument();
        });
    });

    describe('previous episode', () => {
        it('offers the previous one when it is downloaded, saves and plays it', async () => {
            const user = userEvent.setup();
            useAnimeStore.setState({ playing: { animeId: 5, episodeId: 2 } });
            render(<AnimePlayer />);
            setPlayback(getVideo(), 300, 1440);

            await user.click(screen.getByRole('button', { name: 'PREVIOUS EPISODE' }));

            expect(mock.api.saveAnimeProgress).toHaveBeenCalledTimes(1);
            expect(mock.api.saveAnimeProgress).toHaveBeenCalledWith({ episodeId: 2, positionSeconds: 300, durationSeconds: 1440, watched: false });
            expect(useAnimeStore.getState().playing).toEqual({ animeId: 5, episodeId: 1 });
            expect(getVideo()).toHaveAttribute('src', 'pullwave-media://episode/1');
            expect(screen.getByRole('dialog', { name: 'Naruto · EP 1' })).toBeInTheDocument();
        });

        it('offers both the previous and the next episode when both are downloaded, previous first', () => {
            const third = makeEpisode({ id: 3, number: '3', filePath: '/lib/Naruto/Naruto Episode 3.mp4' });
            useAnimeStore.setState({ library: [makeAnime([FIRST, SECOND, third], { id: 5, title: 'Naruto' })], playing: { animeId: 5, episodeId: 2 } });
            render(<AnimePlayer />);
            const labels = screen.getAllByRole('button').map((button) => {
                return button.textContent;
            });
            expect(labels.indexOf('PREVIOUS EPISODE')).toBeGreaterThanOrEqual(0);
            expect(labels.indexOf('PREVIOUS EPISODE')).toBeLessThan(labels.indexOf('NEXT EPISODE'));
        });

        it('does not offer it on the first episode, when the previous is not downloaded or is not there', () => {
            const { unmount } = render(<AnimePlayer />);
            expect(screen.queryByRole('button', { name: 'PREVIOUS EPISODE' })).not.toBeInTheDocument();
            unmount();

            const missing = makeEpisode({ id: 1, number: '1', status: 'queued', filePath: null });
            useAnimeStore.setState({ library: [makeAnime([missing, SECOND], { id: 5 })], playing: { animeId: 5, episodeId: 2 } });
            render(<AnimePlayer />);
            expect(screen.queryByRole('button', { name: 'PREVIOUS EPISODE' })).not.toBeInTheDocument();
        });
    });

    it('tells the user when the video cannot be played', () => {
        render(<AnimePlayer />);
        fireEvent.error(getVideo());
        expect(screen.getByRole('alert')).toHaveTextContent('This video could not be played. Its format may not be supported by the app.');
    });

    it('forgets the error when another episode starts', async () => {
        const user = userEvent.setup();
        render(<AnimePlayer />);
        fireEvent.error(getVideo());
        await user.click(screen.getByRole('button', { name: 'NEXT EPISODE' }));
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    describe('subtitles', () => {
        it('asks for the subtitles of the episode', async () => {
            render(<AnimePlayer />);
            await screen.findByRole('combobox', { name: 'Subtitles' });
            expect(mock.api.listAnimeSubtitles).toHaveBeenCalledTimes(1);
            expect(mock.api.listAnimeSubtitles).toHaveBeenCalledWith(1);
        });

        it('adds a track for each subtitle of the episode, the first one showing', async () => {
            mock.api.listAnimeSubtitles.mockResolvedValue([ENGLISH, JAPANESE, IMPORTED]);
            render(<AnimePlayer />);
            await screen.findByRole('option', { name: 'Japanese' });

            expect(
                trackElements().map((track) => {
                    return [track.id, track.getAttribute('src'), track.getAttribute('label'), track.hasAttribute('default')];
                })
            ).toEqual([
                ['default', 'pullwave-media://subtitle/1', 'English', true],
                ['subtitle-Japanese', 'pullwave-media://subtitle/1/subtitle-Japanese', 'Japanese', false],
                ['import-aula', 'pullwave-media://subtitle/1/import-aula', 'aula', false]
            ]);
            expect(screen.getByRole('combobox', { name: 'Subtitles' })).toHaveValue('default');
        });

        it('has no track and no subtitle control when the episode has no subtitles', async () => {
            mock.api.listAnimeSubtitles.mockResolvedValue([]);
            render(<AnimePlayer />);
            await act(async () => {
                await Promise.resolve();
            });
            expect(trackElements()).toEqual([]);
            expect(screen.queryByRole('combobox', { name: 'Subtitles' })).not.toBeInTheDocument();
        });

        it('shows the subtitle the viewer picks and remembers it for the episode', async () => {
            mock.api.listAnimeSubtitles.mockResolvedValue([ENGLISH, JAPANESE]);
            const user = userEvent.setup();
            render(<AnimePlayer />);
            await screen.findByRole('option', { name: 'Japanese' });

            await user.selectOptions(screen.getByRole('combobox', { name: 'Subtitles' }), 'subtitle-Japanese');
            expect(screen.getByRole('combobox', { name: 'Subtitles' })).toHaveValue('subtitle-Japanese');
            expect(
                trackElements().map((track) => {
                    return track.hasAttribute('default');
                })
            ).toEqual([false, true]);
            expect(window.localStorage.getItem('pullwave-subtitle-1')).toBe('subtitle-Japanese');

            await user.selectOptions(screen.getByRole('combobox', { name: 'Subtitles' }), 'off');
            expect(window.localStorage.getItem('pullwave-subtitle-1')).toBe('off');
        });

        it('uses what the viewer chose the last time they watched the episode', async () => {
            window.localStorage.setItem('pullwave-subtitle-1', 'subtitle-Japanese');
            mock.api.listAnimeSubtitles.mockResolvedValue([ENGLISH, JAPANESE]);
            render(<AnimePlayer />);
            await screen.findByRole('option', { name: 'Japanese' });
            expect(screen.getByRole('combobox', { name: 'Subtitles' })).toHaveValue('subtitle-Japanese');
        });

        it('keeps the subtitles off when the viewer turned them off before', async () => {
            window.localStorage.setItem('pullwave-subtitle-1', 'off');
            mock.api.listAnimeSubtitles.mockResolvedValue([ENGLISH, JAPANESE]);
            render(<AnimePlayer />);
            await screen.findByRole('option', { name: 'Japanese' });
            expect(screen.getByRole('combobox', { name: 'Subtitles' })).toHaveValue('off');
        });

        it('falls back to the first subtitle when the one chosen before is gone', async () => {
            window.localStorage.setItem('pullwave-subtitle-1', 'subtitle-Korean');
            mock.api.listAnimeSubtitles.mockResolvedValue([ENGLISH, JAPANESE]);
            render(<AnimePlayer />);
            await screen.findByRole('option', { name: 'Japanese' });
            expect(screen.getByRole('combobox', { name: 'Subtitles' })).toHaveValue('default');
        });

        it('does not use a list that arrives after the player was closed', async () => {
            let resolve: (tracks: AnimeSubtitleTrack[]) => void = () => {
                return undefined;
            };
            mock.api.listAnimeSubtitles.mockReturnValue(
                new Promise<AnimeSubtitleTrack[]>((done) => {
                    resolve = done;
                })
            );
            const { unmount } = render(<AnimePlayer />);
            unmount();
            await act(async () => {
                resolve([ENGLISH, JAPANESE]);
                await Promise.resolve();
            });
            expect(document.querySelector('track')).toBeNull();
        });

        it('asks again for the subtitles of the next episode', async () => {
            const user = userEvent.setup();
            render(<AnimePlayer />);
            await screen.findByRole('combobox', { name: 'Subtitles' });
            await user.click(screen.getByRole('button', { name: 'NEXT EPISODE' }));
            expect(mock.api.listAnimeSubtitles).toHaveBeenLastCalledWith(2);
        });
    });

    describe('loading a subtitle', () => {
        it('asks the app to load a file for this episode, and shows the new subtitle', async () => {
            mock.api.listAnimeSubtitles.mockResolvedValue([ENGLISH]);
            mock.api.importAnimeSubtitle.mockResolvedValue({ ok: true, tracks: [ENGLISH, IMPORTED], imported: IMPORTED });
            const user = userEvent.setup();
            render(<AnimePlayer />);
            await screen.findByRole('combobox', { name: 'Subtitles' });

            await user.click(screen.getByRole('button', { name: 'LOAD SUBTITLE' }));

            expect(mock.api.importAnimeSubtitle).toHaveBeenCalledTimes(1);
            expect(mock.api.importAnimeSubtitle).toHaveBeenCalledWith(1);
            expect(await screen.findByRole('option', { name: 'aula' })).toBeInTheDocument();
            expect(screen.getByRole('combobox', { name: 'Subtitles' })).toHaveValue('import-aula');
            expect(window.localStorage.getItem('pullwave-subtitle-1')).toBe('import-aula');
            expect(document.querySelector('track[id="import-aula"]')).toHaveAttribute('src', 'pullwave-media://subtitle/1/import-aula');
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });

        it('shows the subtitle loaded for an episode that had none', async () => {
            mock.api.listAnimeSubtitles.mockResolvedValue([]);
            mock.api.importAnimeSubtitle.mockResolvedValue({ ok: true, tracks: [IMPORTED], imported: IMPORTED });
            const user = userEvent.setup();
            render(<AnimePlayer />);
            await user.click(screen.getByRole('button', { name: 'LOAD SUBTITLE' }));
            expect(await screen.findByRole('combobox', { name: 'Subtitles' })).toHaveValue('import-aula');
        });

        it('does nothing when the user gives up', async () => {
            mock.api.importAnimeSubtitle.mockResolvedValue({ ok: false, reason: 'cancelled' });
            const user = userEvent.setup();
            render(<AnimePlayer />);
            await screen.findByRole('combobox', { name: 'Subtitles' });
            await user.click(screen.getByRole('button', { name: 'LOAD SUBTITLE' }));
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
            expect(screen.getByRole('combobox', { name: 'Subtitles' })).toHaveValue('default');
            expect(window.localStorage.getItem('pullwave-subtitle-1')).toBeNull();
        });

        it.each([
            ['unsupported', 'This file is not a subtitle the player understands. Use a .vtt or .srt file.'],
            ['too-large', 'This subtitle file is too large.'],
            ['unreadable', 'The subtitle file could not be read.'],
            ['missing', 'This episode is no longer in the library.']
        ] as const)('says why it could not load the file (%s)', async (reason, message) => {
            mock.api.importAnimeSubtitle.mockResolvedValue({ ok: false, reason });
            const user = userEvent.setup();
            render(<AnimePlayer />);
            await screen.findByRole('combobox', { name: 'Subtitles' });
            await user.click(screen.getByRole('button', { name: 'LOAD SUBTITLE' }));
            expect(screen.getByRole('alert')).toHaveTextContent(message);
        });

        it('forgets the message after a file loads', async () => {
            mock.api.importAnimeSubtitle.mockResolvedValueOnce({ ok: false, reason: 'unsupported' });
            mock.api.importAnimeSubtitle.mockResolvedValueOnce({ ok: true, tracks: [ENGLISH, IMPORTED], imported: IMPORTED });
            const user = userEvent.setup();
            render(<AnimePlayer />);
            await screen.findByRole('combobox', { name: 'Subtitles' });
            await user.click(screen.getByRole('button', { name: 'LOAD SUBTITLE' }));
            expect(screen.getByRole('alert')).toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'LOAD SUBTITLE' }));
            await screen.findByRole('option', { name: 'aula' });
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        });
    });
});
