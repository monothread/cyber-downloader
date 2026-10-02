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
    it('shows an empty state, with a way to import a folder', () => {
        render(<AnimeLibrary />);
        expect(screen.getByText('// THE LIBRARY IS EMPTY. SEARCH AN ANIME AND DOWNLOAD AN EPISODE.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'IMPORT LIBRARY' })).toBeInTheDocument();
        expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    describe('importing a folder', () => {
        it('asks for the import from the empty library and from one that has animes', async () => {
            const user = userEvent.setup();
            const importLibrary = vi.fn(async () => {
                return undefined;
            });
            useAnimeStore.setState({ importLibrary });
            const { unmount } = render(<AnimeLibrary />);
            await user.click(screen.getByRole('button', { name: 'IMPORT LIBRARY' }));
            expect(importLibrary).toHaveBeenCalledTimes(1);
            unmount();

            useAnimeStore.setState({ library: LIBRARY, importLibrary });
            render(<AnimeLibrary />);
            expect(screen.getByRole('button', { name: 'IMPORT LIBRARY' })).toHaveAttribute('title', 'Choose a folder of anime and add what is in it to the library');
            await user.click(screen.getByRole('button', { name: 'IMPORT LIBRARY' }));
            expect(importLibrary).toHaveBeenCalledTimes(2);
        });

        it('shows what the import added and says what it did', async () => {
            const user = userEvent.setup();
            mock.api.importAnimeLibrary.mockResolvedValue({ ok: true, added: 1, relinked: 0, skipped: 0, ignored: 0 });
            mock.api.listAnimeLibrary.mockResolvedValue([makeAnime([makeEpisode({ id: 1 })], { id: 20, title: 'Bleach' })]);
            render(<AnimeLibrary />);
            await user.click(screen.getByRole('button', { name: 'IMPORT LIBRARY' }));
            expect(await screen.findByRole('heading', { name: 'Bleach' })).toBeInTheDocument();
            expect(useAppStore.getState().notice).toEqual({ kind: 'info', message: 'IMPORT DONE: 1 ADDED · 0 POINTED TO A NEW PLACE · 0 ALREADY IN THE LIBRARY · 0 NOT RECOGNIZED' });
        });
    });

    describe('an episode whose file is gone', () => {
        const GONE = makeAnime([makeEpisode({ id: 1, number: '1', fileMissing: true }), makeEpisode({ id: 2, number: '2' })], { id: 30 });

        it('is marked, and cannot be played, while the others can', async () => {
            const user = userEvent.setup();
            useAnimeStore.setState({ library: [GONE] });
            render(<AnimeLibrary />);
            await user.click(screen.getByRole('button', { name: 'SHOW EPISODES' }));
            const [gone, fine] = screen.getAllByTestId('anime-episode');

            const mark = within(gone as HTMLElement).getByRole('img', { name: 'FILE NOT FOUND' });
            expect(mark).toHaveClass('missing-mark');
            expect(mark).toHaveAttribute('title', 'The file of this episode is not on the disk. Use IMPORT LIBRARY to point it to its new place.');
            expect(gone).toHaveClass('history__item--error');
            expect(within(gone as HTMLElement).getByRole('button', { name: 'PLAY: Naruto EP 1' })).toBeDisabled();

            expect(within(fine as HTMLElement).queryByRole('img', { name: 'FILE NOT FOUND' })).not.toBeInTheDocument();
            expect(fine).not.toHaveClass('history__item--error');
            expect(within(fine as HTMLElement).getByRole('button', { name: 'PLAY: Naruto EP 2' })).toBeEnabled();
        });

        it('does not start the player', async () => {
            const user = userEvent.setup();
            useAnimeStore.setState({ library: [GONE] });
            render(<AnimeLibrary />);
            await user.click(screen.getByRole('button', { name: 'SHOW EPISODES' }));
            await user.click(screen.getByRole('button', { name: 'PLAY: Naruto EP 1' }));
            expect(useAnimeStore.getState().playing).toBeNull();
        });
    });

    describe('searching the library', () => {
        const MANY = [
            makeAnime([makeEpisode({ id: 1 })], { id: 1, title: 'Naruto', audio: 'sub' }),
            makeAnime([makeEpisode({ id: 2 })], { id: 2, title: 'Naruto', audio: 'dub' }),
            makeAnime([makeEpisode({ id: 3 })], { id: 3, title: 'Pokémon' }),
            makeAnime([makeEpisode({ id: 4 })], { id: 4, title: 'Cyberpunk: Edgerunners' })
        ];

        function titles(): Array<string | null> {
            return screen.getAllByRole('heading', { level: 3 }).map((heading) => {
                return heading.textContent;
            });
        }

        it('has a search field above the animes', () => {
            useAnimeStore.setState({ library: MANY });
            render(<AnimeLibrary />);
            const field = screen.getByRole('textbox', { name: 'Search the library' });
            expect(field).toHaveValue('');
            expect(field).toHaveAttribute('placeholder', 'Search your animes…');
            expect(screen.getByText('4 ANIMES')).toBeInTheDocument();
            expect(titles()).toEqual(['Naruto', 'Naruto', 'Pokémon', 'Cyberpunk: Edgerunners']);
        });

        it('has none while the library is empty', () => {
            render(<AnimeLibrary />);
            expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
        });

        it('shows only the animes that match, and counts them', async () => {
            const user = userEvent.setup();
            useAnimeStore.setState({ library: MANY });
            render(<AnimeLibrary />);

            await user.type(screen.getByRole('textbox', { name: 'Search the library' }), 'naru');
            expect(titles()).toEqual(['Naruto', 'Naruto']);
            expect(screen.getByText('2 ANIMES')).toBeInTheDocument();
            expect(screen.getAllByTestId('anime-card')).toHaveLength(2);
        });

        it('does not mind the case or the accents', async () => {
            const user = userEvent.setup();
            useAnimeStore.setState({ library: MANY });
            render(<AnimeLibrary />);

            await user.type(screen.getByRole('textbox', { name: 'Search the library' }), 'POKEMON');
            expect(titles()).toEqual(['Pokémon']);
            expect(screen.getByText('1 ANIMES')).toBeInTheDocument();
        });

        it('says when nothing matches, and shows everything again when the search is cleared', async () => {
            const user = userEvent.setup();
            useAnimeStore.setState({ library: MANY });
            render(<AnimeLibrary />);
            const field = screen.getByRole('textbox', { name: 'Search the library' });

            await user.type(field, 'bleach');
            expect(screen.getByText('// NO ANIME IN THE LIBRARY MATCHES THIS SEARCH.')).toBeInTheDocument();
            expect(screen.queryByTestId('anime-card')).not.toBeInTheDocument();
            expect(screen.getByText('0 ANIMES')).toBeInTheDocument();
            expect(field).toBeInTheDocument();

            await user.clear(field);
            expect(screen.queryByText('// NO ANIME IN THE LIBRARY MATCHES THIS SEARCH.')).not.toBeInTheDocument();
            expect(titles()).toHaveLength(4);
        });

        it('keeps the buttons of the animes that are shown working', async () => {
            const user = userEvent.setup();
            useAnimeStore.setState({ library: MANY });
            render(<AnimeLibrary />);
            await user.type(screen.getByRole('textbox', { name: 'Search the library' }), 'cyber');
            await user.click(screen.getByRole('button', { name: 'OPEN FOLDER: Cyberpunk: Edgerunners' }));
            expect(mock.api.openAnimeFolder).toHaveBeenCalledWith(4);
        });
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

    it('has a button on each anime that opens it in the search', async () => {
        const user = userEvent.setup();
        const openLibraryAnime = vi.fn(async () => {
            return undefined;
        });
        useAnimeStore.setState({ library: LIBRARY, openLibraryAnime });
        render(<AnimeLibrary />);

        const buttons = screen.getAllByRole('button', { name: 'GET MORE EPISODES: Naruto' });
        expect(buttons).toHaveLength(2);
        await user.click(buttons[1] as HTMLElement);
        expect(openLibraryAnime).toHaveBeenCalledTimes(1);
        expect(openLibraryAnime).toHaveBeenCalledWith(LIBRARY[1]);
    });

    it('shows the anime in the search with its episodes when the button is used', async () => {
        const user = userEvent.setup();
        mock.api.listAnimeEpisodes.mockResolvedValue({ ok: true, episodes: ['1', '2'] });
        useAnimeStore.setState({ library: [LIBRARY[0] as (typeof LIBRARY)[number]], view: 'library' });
        render(<AnimeLibrary />);
        await user.click(screen.getByRole('button', { name: 'GET MORE EPISODES: Naruto' }));

        expect(useAnimeStore.getState().view).toBe('search');
        expect(mock.api.listAnimeEpisodes).toHaveBeenCalledWith('naruto', 1, 'sub');
        expect(useAnimeStore.getState().selection).toMatchObject({ result: { index: 1, title: 'Naruto' }, status: 'ready', episodes: ['1', '2'] });
    });

    describe('coming from the search', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('shows the anime that was looked at open and scrolls it into view', () => {
            const scrollIntoView = vi.fn();
            Element.prototype.scrollIntoView = scrollIntoView;
            useAnimeStore.setState({ library: LIBRARY, libraryFocus: 10 });
            render(<AnimeLibrary />);

            const [focused, other] = screen.getAllByTestId('anime-card');
            expect(within(focused as HTMLElement).getAllByTestId('anime-episode')).toHaveLength(6);
            expect(within(other as HTMLElement).queryByTestId('anime-episode')).not.toBeInTheDocument();
            expect(within(focused as HTMLElement).getByRole('button', { name: 'HIDE EPISODES' })).toHaveAttribute('aria-expanded', 'true');
            expect(scrollIntoView).toHaveBeenCalledTimes(1);
            expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
        });

        it('keeps every anime closed when none was looked at', () => {
            const scrollIntoView = vi.fn();
            Element.prototype.scrollIntoView = scrollIntoView;
            useAnimeStore.setState({ library: LIBRARY, libraryFocus: null });
            render(<AnimeLibrary />);
            expect(screen.queryByTestId('anime-episode')).not.toBeInTheDocument();
            expect(scrollIntoView).not.toHaveBeenCalled();
        });

        it('works where the browser cannot scroll an element into view', () => {
            Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
            useAnimeStore.setState({ library: LIBRARY, libraryFocus: 10 });
            expect(() => {
                render(<AnimeLibrary />);
            }).not.toThrow();
            expect(screen.getAllByTestId('anime-episode')).toHaveLength(6);
        });
    });

    describe('marking an episode as watched', () => {
        function open(): void {
            useAnimeStore.setState({ library: [LIBRARY[0] as (typeof LIBRARY)[number]] });
        }

        it('offers to mark a downloaded episode as watched, and to undo it when it is', async () => {
            const user = userEvent.setup();
            const setWatched = vi.fn(async () => {
                return undefined;
            });
            open();
            useAnimeStore.setState({ setWatched });
            render(<AnimeLibrary />);
            await user.click(screen.getByRole('button', { name: 'SHOW EPISODES' }));

            const unwatched = screen.getByRole('button', { name: 'MARK AS WATCHED: Naruto EP 1' });
            expect(unwatched).toHaveAttribute('aria-pressed', 'false');
            await user.click(unwatched);
            expect(setWatched).toHaveBeenLastCalledWith(1, true);

            const watched = screen.getByRole('button', { name: 'MARK AS UNWATCHED: Naruto EP 3' });
            expect(watched).toHaveAttribute('aria-pressed', 'true');
            await user.click(watched);
            expect(setWatched).toHaveBeenLastCalledWith(3, false);
            expect(setWatched).toHaveBeenCalledTimes(2);
        });

        it('has the button only on downloaded episodes', async () => {
            const user = userEvent.setup();
            open();
            render(<AnimeLibrary />);
            await user.click(screen.getByRole('button', { name: 'SHOW EPISODES' }));
            expect(screen.getAllByRole('button', { name: /^MARK AS (UN)?WATCHED/ })).toHaveLength(3);
            ['4', '5', '6'].forEach((number) => {
                expect(screen.queryByRole('button', { name: new RegExp(`MARK AS (UN)?WATCHED: Naruto EP ${number}$`) })).not.toBeInTheDocument();
            });
        });

        it('saves the mark and shows the episode as watched', async () => {
            const user = userEvent.setup();
            open();
            const episode = makeEpisode({ id: 1, number: '1', sizeBytes: 2 * 1024 ** 2, watched: true });
            mock.api.listAnimeLibrary.mockResolvedValue([makeAnime([episode], { id: 10, title: 'Naruto', audio: 'sub' })]);
            render(<AnimeLibrary />);
            await user.click(screen.getByRole('button', { name: 'SHOW EPISODES' }));
            await user.click(screen.getByRole('button', { name: 'MARK AS WATCHED: Naruto EP 1' }));

            expect(mock.api.saveAnimeProgress).toHaveBeenCalledWith({ episodeId: 1, positionSeconds: 0, durationSeconds: 0, watched: true });
            expect(await screen.findByRole('button', { name: 'MARK AS UNWATCHED: Naruto EP 1' })).toBeInTheDocument();
            expect(screen.getByRole('img', { name: 'WATCHED' })).toBeInTheDocument();
            expect(screen.getByTestId('anime-episode')).toHaveClass('history__item--watched');
        });
    });

    describe('the folder of the videos', () => {
        it('opens the folder of an anime that has an episode downloaded', async () => {
            const user = userEvent.setup();
            useAnimeStore.setState({ library: LIBRARY });
            render(<AnimeLibrary />);

            const buttons = screen.getAllByRole('button', { name: 'OPEN FOLDER: Naruto' });
            expect(buttons).toHaveLength(1);
            await user.click(buttons[0] as HTMLElement);
            expect(mock.api.openAnimeFolder).toHaveBeenCalledTimes(1);
            expect(mock.api.openAnimeFolder).toHaveBeenCalledWith(10);
            expect(mock.api.showItemInFolder).not.toHaveBeenCalled();
        });

        it('is not offered when nothing is downloaded', () => {
            useAnimeStore.setState({
                library: [makeAnime([makeEpisode({ id: 1, status: 'error', filePath: null }), makeEpisode({ id: 2, status: 'queued', filePath: null })], { id: 12 })]
            });
            render(<AnimeLibrary />);
            expect(screen.queryByRole('button', { name: /OPEN FOLDER/ })).not.toBeInTheDocument();
        });
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
                'DOWNLOADED · 1.0 KiB',
                'FAILED',
                'CANCELLED',
                'QUEUED'
            ]);
            expect(rows[3]).toHaveClass('history__item--error');
            expect(rows[0]).not.toHaveClass('history__item--error');
        });

        it('marks only the watched episode with a visual indicator, not with a word', async () => {
            const { rows } = await expand();
            const watched = within(rows[2] as HTMLElement).getByRole('img', { name: 'WATCHED' });
            expect(watched).toHaveClass('watched-mark');
            expect(watched).toHaveTextContent('✓');
            expect(watched).toHaveAttribute('title', 'WATCHED');
            expect(rows[2]).toHaveClass('history__item--watched');
            expect(rows[2]?.querySelector('.history__meta')?.textContent).not.toContain('WATCHED');
            expect(screen.getAllByRole('img', { name: 'WATCHED' })).toHaveLength(1);
            [0, 1, 3, 4, 5].forEach((position) => {
                expect(rows[position]).not.toHaveClass('history__item--watched');
                expect(within(rows[position] as HTMLElement).queryByRole('img', { name: 'WATCHED' })).not.toBeInTheDocument();
            });
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

        it('has no button to show the file of an episode, which is what the button of the anime is for', async () => {
            await expand();
            expect(screen.queryByRole('button', { name: /^SHOW FILE/ })).not.toBeInTheDocument();
            expect(screen.getAllByRole('button', { name: 'OPEN FOLDER: Naruto' })).toHaveLength(1);
        });

        it('does not offer to play anything that is not downloaded', async () => {
            const { rows } = await expand();
            [3, 4, 5].forEach((position) => {
                expect(within(rows[position] as HTMLElement).queryByRole('button', { name: /^PLAY/ })).not.toBeInTheDocument();
            });
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
