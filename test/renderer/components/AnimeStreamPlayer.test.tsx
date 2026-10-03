// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnimeStream } from '@shared/anime';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { AnimeStreamPlayer, STREAM_BUFFER_SECONDS } from '@renderer/components/AnimeStreamPlayer';
import { INITIAL_SEARCH, UNSUPPORTED_STATUS, useAnimeStore } from '@renderer/store/animeStore';
import { useAppStore } from '@renderer/store/appStore';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';
import { openedSubtitleMenu } from '../../helpers/playerSettings';

const hls = vi.hoisted(() => {
    type Listener = (event: string, data: { fatal: boolean }) => void;
    const state = {
        supported: true,
        instances: [] as Array<{
            options: unknown;
            source: string | null;
            media: HTMLVideoElement | null;
            destroyed: boolean;
            listeners: Record<string, Listener>;
        }>
    };
    class FakeHls {
        static Events = { ERROR: 'hlsError' };
        static isSupported(): boolean {
            return state.supported;
        }
        readonly record: (typeof state.instances)[number];
        constructor(options: unknown) {
            this.record = { options, source: null, media: null, destroyed: false, listeners: {} };
            state.instances.push(this.record);
        }
        on(event: string, listener: Listener): void {
            this.record.listeners[event] = listener;
        }
        loadSource(url: string): void {
            this.record.source = url;
        }
        attachMedia(media: HTMLVideoElement): void {
            this.record.media = media;
        }
        destroy(): void {
            this.record.destroyed = true;
        }
    }
    return { state, FakeHls };
});

vi.mock('hls.js', () => {
    return { default: hls.FakeHls };
});

let mock: MockApiHandle;
const initialApp = useAppStore.getState();
const initialAnime = useAnimeStore.getState();

const STREAM: AnimeStream = { sessionId: 's1', url: 'pullwave-stream://p/s1/abc', subtitleUrl: 'pullwave-stream://p/s1/def' };

beforeEach(() => {
    mock = installMockApi();
    hls.state.supported = true;
    hls.state.instances.length = 0;
    useAppStore.setState({ ...initialApp, settings: DEFAULT_SETTINGS });
    useAnimeStore.setState({ ...initialAnime, status: UNSUPPORTED_STATUS, jobs: [], library: [], search: INITIAL_SEARCH, selection: null, playing: null, streaming: null });
});

function stream(overrides: Partial<NonNullable<ReturnType<typeof useAnimeStore.getState>['streaming']>> = {}): void {
    useAnimeStore.setState({ streaming: { title: 'The Apothecary Diaries', episode: '3', status: 'ready', stream: STREAM, error: null, ...overrides } });
}

describe('AnimeStreamPlayer', () => {
    it('renders nothing when nothing is being watched', () => {
        const { container } = render(<AnimeStreamPlayer />);
        expect(container).toBeEmptyDOMElement();
    });

    it('opens a dialog named after the episode and focuses the close button', () => {
        stream();
        render(<AnimeStreamPlayer />);
        const dialog = screen.getByRole('dialog', { name: 'The Apothecary Diaries · EP 3' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByRole('heading', { name: 'The Apothecary Diaries · EP 3' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CLOSE' })).toHaveFocus();
    });

    it('says the video is being found', () => {
        stream({ status: 'loading', stream: null });
        render(<AnimeStreamPlayer />);
        expect(screen.getByText('FINDING THE VIDEO…')).toBeInTheDocument();
        expect(document.querySelector('video')).toBeNull();
    });

    it('explains why the video could not be found and keeps the raw text as a tooltip', () => {
        stream({ status: 'error', stream: null, error: { code: 'NO_SOURCES', raw: 'No sources found for sub!' } });
        render(<AnimeStreamPlayer />);
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('No video source was found for this episode.');
        expect(alert).toHaveAttribute('title', 'No sources found for sub!');
        expect(document.querySelector('video')).toBeNull();
    });

    it('does not show an error without one', () => {
        stream({ status: 'error', stream: null, error: null });
        render(<AnimeStreamPlayer />);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    describe('the video', () => {
        it('feeds hls.js with the playlist and attaches it to the video, without a worker', () => {
            stream();
            render(<AnimeStreamPlayer />);

            const video = document.querySelector('video') as HTMLVideoElement;
            expect(video.controls).toBe(false);
            expect(video.autoplay).toBe(true);
            expect(video.parentElement).toHaveClass('player__stage');
            expect(video.nextElementSibling).toHaveClass('player__controls');
            expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
            expect(screen.getByRole('slider', { name: 'Seek' })).toBeInTheDocument();
            expect(screen.getByRole('slider', { name: 'Volume' })).toBeInTheDocument();
            expect(openedSubtitleMenu()).toHaveValue('stream');
            expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeInTheDocument();
            expect(video).toHaveAttribute('crossorigin', 'anonymous');
            expect(hls.state.instances).toHaveLength(1);
            expect(hls.state.instances[0]).toMatchObject({ options: { enableWorker: false, maxBufferLength: 60 }, source: STREAM.url, destroyed: false });
            expect(hls.state.instances[0]?.media).toBe(video);
        });

        it('lets hls.js load a minute of the episode ahead of what is playing', () => {
            expect(STREAM_BUFFER_SECONDS).toBe(60);
            stream();
            render(<AnimeStreamPlayer />);
            expect(hls.state.instances[0]?.options).toEqual({ enableWorker: false, maxBufferLength: STREAM_BUFFER_SECONDS });
        });

        it('shows the subtitles when there are some', () => {
            stream();
            render(<AnimeStreamPlayer />);
            const track = document.querySelector('track');
            expect(track).toHaveAttribute('src', STREAM.subtitleUrl as string);
            expect(track).toHaveAttribute('kind', 'subtitles');
            expect(track).toHaveAttribute('label', 'Subtitles');
            expect(track?.hasAttribute('default')).toBe(true);
            expect(track).toHaveAttribute('id', 'stream');
        });

        it('lets the viewer turn the subtitles off and on', async () => {
            stream();
            const user = userEvent.setup();
            render(<AnimeStreamPlayer />);
            const select = openedSubtitleMenu();
            await user.selectOptions(select, 'off');
            expect(select).toHaveValue('off');
            await user.selectOptions(select, 'stream');
            expect(select).toHaveValue('stream');
        });

        it('has no subtitle track without subtitles', () => {
            stream({ stream: { ...STREAM, subtitleUrl: null } });
            render(<AnimeStreamPlayer />);
            expect(document.querySelector('track')).toBeNull();
            expect(screen.queryByRole('combobox', { name: 'Subtitles' })).not.toBeInTheDocument();
        });

        it('says so when hls.js reports a failure it cannot recover from', () => {
            stream();
            render(<AnimeStreamPlayer />);
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();

            act(() => {
                hls.state.instances[0]?.listeners.hlsError?.('hlsError', { fatal: false });
            });
            expect(screen.queryByRole('alert')).not.toBeInTheDocument();

            act(() => {
                hls.state.instances[0]?.listeners.hlsError?.('hlsError', { fatal: true });
            });
            expect(screen.getByRole('alert')).toHaveTextContent('This video could not be played. Its format may not be supported by the app.');
        });

        it('says so when the browser cannot play this kind of stream', () => {
            hls.state.supported = false;
            stream();
            render(<AnimeStreamPlayer />);
            expect(screen.getByRole('alert')).toHaveTextContent('This video could not be played.');
            expect(hls.state.instances).toHaveLength(0);
        });

        it('lets go of hls.js when it is closed', () => {
            stream();
            const { unmount } = render(<AnimeStreamPlayer />);
            unmount();
            expect(hls.state.instances[0]?.destroyed).toBe(true);
        });

        it('starts over with a new video when another stream is opened', () => {
            stream();
            render(<AnimeStreamPlayer />);
            act(() => {
                stream({ stream: { sessionId: 's2', url: 'pullwave-stream://p/s2/xyz', subtitleUrl: null } });
            });
            expect(hls.state.instances).toHaveLength(2);
            expect(hls.state.instances[0]?.destroyed).toBe(true);
            expect(hls.state.instances[1]?.source).toBe('pullwave-stream://p/s2/xyz');
        });
    });

    describe('closing', () => {
        it('closes with the button and lets the main process drop the stream', async () => {
            const user = userEvent.setup();
            stream();
            render(<AnimeStreamPlayer />);
            await user.click(screen.getByRole('button', { name: 'CLOSE' }));
            expect(useAnimeStore.getState().streaming).toBeNull();
            expect(mock.api.closeAnimeStream).toHaveBeenCalledWith('s1');
        });

        it('closes with Escape and ignores other keys', () => {
            stream();
            render(<AnimeStreamPlayer />);
            fireEvent.keyDown(window, { key: 'Enter' });
            expect(useAnimeStore.getState().streaming).not.toBeNull();
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(useAnimeStore.getState().streaming).toBeNull();
            expect(mock.api.closeAnimeStream).toHaveBeenCalledWith('s1');
        });

        it('can be closed while the video is still being found', async () => {
            const user = userEvent.setup();
            stream({ status: 'loading', stream: null });
            render(<AnimeStreamPlayer />);
            await user.click(screen.getByRole('button', { name: 'CLOSE' }));
            expect(useAnimeStore.getState().streaming).toBeNull();
            expect(mock.api.closeAnimeStream).not.toHaveBeenCalled();
        });

        it('stops listening for Escape once it is gone', () => {
            stream();
            const { unmount } = render(<AnimeStreamPlayer />);
            unmount();
            fireEvent.keyDown(window, { key: 'Escape' });
            expect(mock.api.closeAnimeStream).not.toHaveBeenCalled();
        });
    });
});
