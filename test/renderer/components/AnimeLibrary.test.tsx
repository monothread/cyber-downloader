// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { AnimeLibrary } from '@renderer/components/AnimeLibrary';
import { INITIAL_SEARCH, UNSUPPORTED_STATUS, useAnimeStore } from '@renderer/store/animeStore';
import { useAppStore } from '@renderer/store/appStore';
import { makeAnime, makeEpisode } from '../../helpers/animeFixtures';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initialApp = useAppStore.getState();
const initialAnime = useAnimeStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initialApp, settings: DEFAULT_SETTINGS });
    useAnimeStore.setState({ ...initialAnime, status: UNSUPPORTED_STATUS, jobs: [], library: [], search: INITIAL_SEARCH, selection: null, playing: null });
});

const LIBRARY = [
    makeAnime(
        [
            makeEpisode({ id: 1, number: '1', sizeBytes: 2 * 1024 ** 2 }),
            makeEpisode({ id: 2, number: '2', sizeBytes: 3 * 1024 ** 2, positionSeconds: 600, durationSeconds: 1440 }),
            makeEpisode({ id: 3, number: '3', sizeBytes: 1024, watched: true, positionSeconds: 1400, durationSeconds: 1440 }),
            makeEpisode({ id: 4, number: '4', status: 'error', sizeBytes: null, filePath: null, error: { code: 'NO_SOURCES', raw: 'No sources found for sub!' } }),
            makeEpisode({ id: 5, number: '5', status: 'cancelled', sizeBytes: null, filePath: null }),
            makeEpisode({ id: 6, number: '6', status: 'queued', sizeBytes: null, filePath: null })
        ],
        { id: 10, title: 'Naruto', audio: 'sub' }
    ),
    makeAnime([], { id: 11, title: 'Naruto', audio: 'dub' })
];

describe('AnimeLibrary', () => {
    it('shows an empty state', () => {
        render(<AnimeLibrary />);
        expect(screen.getByText('// THE LIBRARY IS EMPTY. SEARCH AN ANIME AND DOWNLOAD AN EPISODE.')).toBeInTheDocument();
    });

    it('lists the animes with their audio and how many episodes are downloaded', () => {
        useAnimeStore.setState({ library: LIBRARY });
        render(<AnimeLibrary />);

        expect(screen.getByText('2 ANIMES')).toBeInTheDocument();
        const [subbed, dubbed] = screen.getAllByTestId('anime-card');
        expect(within(subbed as HTMLElement).getByRole('heading', { name: 'Naruto' })).toBeInTheDocument();
        expect(within(subbed as HTMLElement).getByText('SUBTITLED')).toBeInTheDocument();
        expect(within(subbed as HTMLElement).getByText('3/6 DOWNLOADED')).toBeInTheDocument();
        expect(within(dubbed as HTMLElement).getByText('DUBBED')).toBeInTheDocument();
        expect(within(dubbed as HTMLElement).getByText('0/0 DOWNLOADED')).toBeInTheDocument();
        expect(screen.queryByTestId('anime-episode')).not.toBeInTheDocument();
    });

    it('shows and hides the episodes', async () => {
        const user = userEvent.setup();
        useAnimeStore.setState({ library: [LIBRARY[0] as (typeof LIBRARY)[number]] });
        render(<AnimeLibrary />);

        const toggle = screen.getByRole('button', { name: 'SHOW EPISODES' });
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await user.click(toggle);
        expect(screen.getAllByTestId('anime-episode')).toHaveLength(6);
        expect(screen.getByRole('button', { name: 'HIDE EPISODES' })).toHaveAttribute('aria-expanded', 'true');

        await user.click(screen.getByRole('button', { name: 'HIDE EPISODES' }));
        expect(screen.queryByTestId('anime-episode')).not.toBeInTheDocument();
    });

    describe('episodes', () => {
        async function expand() {
            const user = userEvent.setup();
            useAnimeStore.setState({ library: [LIBRARY[0] as (typeof LIBRARY)[number]] });
            render(<AnimeLibrary />);
            await user.click(screen.getByRole('button', { name: 'SHOW EPISODES' }));
            return { user, rows: screen.getAllByTestId('anime-episode') };
        }

        it('describes each episode: status, size and where it stopped', async () => {
            const { rows } = await expand();
            const meta = rows.map((row) => {
                return row.querySelector('.history__meta')?.textContent;
            });
            expect(meta).toEqual([
                'DOWNLOADED · 2.0 MiB',
                'DOWNLOADED · 3.0 MiB · RESUME 10:00',
                'DOWNLOADED · 1.0 KiB · WATCHED',
                'FAILED',
                'CANCELLED',
                'QUEUED'
            ]);
            expect(rows[3]).toHaveClass('history__item--error');
            expect(rows[0]).not.toHaveClass('history__item--error');
        });

        it('explains why an episode failed', async () => {
            const { rows } = await expand();
            const reason = within(rows[3] as HTMLElement).getByText('No video source was found for this episode.');
            expect(reason).toHaveAttribute('title', 'No sources found for sub!');
        });

        it('plays a downloaded episode', async () => {
            const { user } = await expand();
            await user.click(screen.getByRole('button', { name: 'PLAY: Naruto EP 2' }));
            expect(useAnimeStore.getState().playing).toEqual({ animeId: 10, episodeId: 2 });
        });

        it('shows the file of a downloaded episode', async () => {
            const { user } = await expand();
            await user.click(screen.getByRole('button', { name: 'SHOW FILE: Naruto EP 1' }));
            expect(mock.api.showItemInFolder).toHaveBeenCalledWith('/lib/Naruto/Naruto Episode 1.mp4');
        });

        it('does not offer to play or show anything that is not downloaded', async () => {
            const { rows } = await expand();
            [3, 4, 5].forEach((position) => {
                expect(within(rows[position] as HTMLElement).queryByRole('button', { name: /^PLAY/ })).not.toBeInTheDocument();
                expect(within(rows[position] as HTMLElement).queryByRole('button', { name: /^SHOW FILE/ })).not.toBeInTheDocument();
            });
        });

        it('does not offer to show a file that has no path', async () => {
            const user = userEvent.setup();
            useAnimeStore.setState({ library: [makeAnime([makeEpisode({ id: 1, filePath: null })], { id: 10 })] });
            render(<AnimeLibrary />);
            await user.click(screen.getByRole('button', { name: 'SHOW EPISODES' }));
            expect(screen.getByRole('button', { name: 'PLAY: Naruto EP 1' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: /^SHOW FILE/ })).not.toBeInTheDocument();
        });

        it('retries a failed or cancelled episode', async () => {
            const { user } = await expand();
            await user.click(screen.getByRole('button', { name: 'RETRY: Naruto EP 4' }));
            await user.click(screen.getByRole('button', { name: 'RETRY: Naruto EP 5' }));
            expect(mock.api.retryAnimeJob.mock.calls).toEqual([[4], [5]]);
            expect(screen.queryByRole('button', { name: 'RETRY: Naruto EP 6' })).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'RETRY: Naruto EP 1' })).not.toBeInTheDocument();
        });

        it('removes an episode, asking first', async () => {
            const { user } = await expand();
            await user.click(screen.getByRole('button', { name: 'REMOVE: Naruto EP 1' }));
            expect(mock.api.removeAnimeEpisode).not.toHaveBeenCalled();
            await user.click(screen.getByRole('button', { name: 'CONFIRM' }));
            expect(mock.api.removeAnimeEpisode).toHaveBeenCalledWith(1);
        });

        it('does not ask whether to delete the files', async () => {
            const { user } = await expand();
            await user.click(screen.getByRole('button', { name: 'REMOVE: Naruto EP 6' }));
            expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
            await user.click(screen.getByRole('button', { name: 'CONFIRM' }));
            expect(mock.api.removeAnimeEpisode).toHaveBeenCalledWith(6);
        });
    });

    it('removes a whole anime, asking first', async () => {
        const user = userEvent.setup();
        useAnimeStore.setState({ library: LIBRARY });
        render(<AnimeLibrary />);

        const [first, second] = screen.getAllByTestId('anime-card');
        await user.click(within(first as HTMLElement).getByRole('button', { name: 'REMOVE ANIME: Naruto' }));
        expect(mock.api.removeAnime).not.toHaveBeenCalled();
        expect(within(first as HTMLElement).queryByRole('checkbox')).not.toBeInTheDocument();
        await user.click(within(first as HTMLElement).getByRole('button', { name: 'CONFIRM' }));
        expect(mock.api.removeAnime).toHaveBeenCalledWith(10);

        await user.click(within(second as HTMLElement).getByRole('button', { name: 'REMOVE ANIME: Naruto' }));
        await user.click(within(second as HTMLElement).getByRole('button', { name: 'CONFIRM' }));
        expect(mock.api.removeAnime).toHaveBeenLastCalledWith(11);
    });
});
