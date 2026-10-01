// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
});

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
        expect(video.controls).toBe(true);
        expect(video.autoplay).toBe(true);
        const track = video.querySelector('track');
        expect(track).toHaveAttribute('src', 'pullwave-media://subtitle/1');
        expect(track).toHaveAttribute('kind', 'subtitles');
        expect(track).toHaveAttribute('label', 'Subtitles');
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
});
