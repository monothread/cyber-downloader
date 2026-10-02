// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnimeSearchResult } from '@shared/anime';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { AnimeSearch } from '@renderer/components/AnimeSearch';
import { INITIAL_SEARCH, UNSUPPORTED_STATUS, useAnimeStore } from '@renderer/store/animeStore';
import { useAppStore } from '@renderer/store/appStore';
import { makeAnime, makeEpisode } from '../../helpers/animeFixtures';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initialApp = useAppStore.getState();
const initialAnime = useAnimeStore.getState();

const RESULTS: AnimeSearchResult[] = [
    { index: 1, title: 'Cyberpunk: Edgerunners' },
    { index: 2, title: 'Cyberpunk: Edgerunners 2' }
];

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initialApp, settings: DEFAULT_SETTINGS, notice: null });
    useAnimeStore.setState({ ...initialAnime, status: UNSUPPORTED_STATUS, jobs: [], library: [], search: INITIAL_SEARCH, selection: null, playing: null, streaming: null });
});

describe('AnimeSearch form', () => {
    it('starts with an empty form and a disabled button', () => {
        render(<AnimeSearch />);
        expect(screen.getByLabelText('Anime name')).toHaveValue('');
        expect(screen.getByLabelText('Anime name')).toHaveAttribute('placeholder', 'Search an anime…');
        expect(screen.getByLabelText('Audio')).toHaveValue('sub');
        expect(screen.getByRole('button', { name: 'SEARCH' })).toBeDisabled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('offers the audio of the settings and the two audios', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, animeAudio: 'dub' } });
        render(<AnimeSearch />);
        expect(screen.getByLabelText('Audio')).toHaveValue('dub');
        expect(
            within(screen.getByLabelText('Audio'))
                .getAllByRole('option')
                .map((option) => {
                    return option.textContent;
                })
        ).toEqual(['SUBTITLED', 'DUBBED']);
    });

    it('searches when the form is submitted', async () => {
        const user = userEvent.setup();
        mock.api.searchAnime.mockResolvedValue({ ok: true, results: RESULTS });
        render(<AnimeSearch />);

        await user.type(screen.getByLabelText('Anime name'), 'cyberpunk');
        await user.selectOptions(screen.getByLabelText('Audio'), 'dub');
        await user.click(screen.getByRole('button', { name: 'SEARCH' }));

        expect(mock.api.searchAnime).toHaveBeenCalledWith('cyberpunk', 'dub');
        expect(await screen.findByText('2 RESULTS')).toBeInTheDocument();
    });

    it('clears the results when the name is emptied', async () => {
        const user = userEvent.setup();
        mock.api.searchAnime.mockResolvedValue({ ok: true, results: RESULTS });
        render(<AnimeSearch />);

        await user.type(screen.getByLabelText('Anime name'), 'cyberpunk{Enter}');
        expect(await screen.findByText('2 RESULTS')).toBeInTheDocument();

        await user.clear(screen.getByLabelText('Anime name'));

        expect(screen.queryByText('2 RESULTS')).not.toBeInTheDocument();
        expect(screen.queryAllByRole('listitem')).toHaveLength(0);
        expect(screen.getByLabelText('Anime name')).toHaveValue('');
        expect(screen.getByRole('button', { name: 'SEARCH' })).toBeDisabled();
    });

    it('searches with Enter', async () => {
        const user = userEvent.setup();
        mock.api.searchAnime.mockResolvedValue({ ok: true, results: [] });
        render(<AnimeSearch />);
        await user.type(screen.getByLabelText('Anime name'), 'naruto{Enter}');
        expect(mock.api.searchAnime).toHaveBeenCalledWith('naruto', 'sub');
    });

    it('disables the button and says so while searching', async () => {
        const user = userEvent.setup();
        mock.api.searchAnime.mockReturnValue(
            new Promise(() => {
                return undefined;
            })
        );
        render(<AnimeSearch />);
        await user.type(screen.getByLabelText('Anime name'), 'naruto');
        await user.click(screen.getByRole('button', { name: 'SEARCH' }));
        expect(screen.getByRole('button', { name: 'SEARCHING…' })).toBeDisabled();
    });
});

describe('AnimeSearch results', () => {
    it('lists the results', () => {
        useAnimeStore.setState({ search: { ...INITIAL_SEARCH, status: 'done', results: RESULTS, searchedQuery: 'cyberpunk' } });
        render(<AnimeSearch />);
        expect(screen.getByText('2 RESULTS')).toBeInTheDocument();
        expect(screen.getByText('Cyberpunk: Edgerunners')).toHaveAttribute('title', 'Cyberpunk: Edgerunners');
        expect(screen.getByRole('button', { name: 'OPEN: Cyberpunk: Edgerunners 2' })).toBeInTheDocument();
    });

    it('has a button to the library on the results that are already downloaded, and only on them', async () => {
        const user = userEvent.setup();
        const showInLibrary = vi.fn();
        useAnimeStore.setState({
            search: { ...INITIAL_SEARCH, status: 'done', results: RESULTS, searchedQuery: 'cyberpunk', searchedAudio: 'sub' },
            library: [
                makeAnime([makeEpisode({ id: 1 })], { id: 4, title: 'Cyberpunk: Edgerunners', audio: 'sub' }),
                makeAnime([makeEpisode({ id: 2 })], { id: 5, title: 'Cyberpunk: Edgerunners 2', audio: 'dub' })
            ],
            showInLibrary
        });
        render(<AnimeSearch />);

        expect(screen.getAllByRole('button', { name: /^VIEW IN LIBRARY/ })).toHaveLength(1);
        expect(screen.queryByRole('button', { name: 'VIEW IN LIBRARY: Cyberpunk: Edgerunners 2' })).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'VIEW IN LIBRARY: Cyberpunk: Edgerunners' }));
        expect(showInLibrary).toHaveBeenCalledTimes(1);
        expect(showInLibrary).toHaveBeenCalledWith(4);
    });

    it('tags a result with the name it is shown with in its series when it has one', () => {
        useAnimeStore.setState({
            search: { ...INITIAL_SEARCH, status: 'done', results: RESULTS, searchedQuery: 'cyberpunk', searchedAudio: 'sub' },
            library: [makeAnime([], { id: 1, title: 'Cyberpunk: Edgerunners', audio: 'sub', series: 'Cyberpunk', season: 1, seasonName: 'Final Cut' })]
        });
        render(<AnimeSearch />);
        expect(screen.getByText('Cyberpunk · Final Cut')).toHaveClass('history__meta');
    });

    it('tags a result that is in the library with its series and season, and no other', () => {
        useAnimeStore.setState({
            search: { ...INITIAL_SEARCH, status: 'done', results: RESULTS, searchedQuery: 'cyberpunk', searchedAudio: 'sub' },
            library: [
                makeAnime([], { id: 1, title: 'Cyberpunk: Edgerunners', audio: 'sub', series: 'Cyberpunk', season: 1 }),
                makeAnime([], { id: 2, title: 'Cyberpunk: Edgerunners 2', audio: 'dub', series: 'Cyberpunk', season: 2 }),
                makeAnime([], { id: 3, title: 'Cyberpunk: Edgerunners', audio: 'dub' })
            ]
        });
        render(<AnimeSearch />);
        expect(screen.getAllByText(/SEASON|Final/)).toHaveLength(1);
        expect(screen.getByText('Cyberpunk · SEASON 1')).toHaveClass('history__meta');
    });

    it('says when nothing was found', () => {
        useAnimeStore.setState({ search: { ...INITIAL_SEARCH, status: 'done', results: [] } });
        render(<AnimeSearch />);
        expect(screen.getByText('// NOTHING FOUND.')).toBeInTheDocument();
    });

    it('explains an error and keeps the raw text as a tooltip', () => {
        useAnimeStore.setState({ search: { ...INITIAL_SEARCH, status: 'error', error: { code: 'BLOCKED', raw: 'Blocked by cloudflare.' } } });
        render(<AnimeSearch />);
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('The source blocked the request. Try again later.');
        expect(alert).toHaveAttribute('title', 'Blocked by cloudflare.');
    });

    it('opens a result and shows its episodes', async () => {
        const user = userEvent.setup();
        mock.api.listAnimeEpisodes.mockResolvedValue({ ok: true, episodes: ['1', '2', '3'] });
        useAnimeStore.setState({ search: { ...INITIAL_SEARCH, status: 'done', results: RESULTS, searchedQuery: 'cyberpunk', searchedAudio: 'dub' } });
        render(<AnimeSearch />);

        await user.click(screen.getByRole('button', { name: 'OPEN: Cyberpunk: Edgerunners 2' }));

        expect(mock.api.listAnimeEpisodes).toHaveBeenCalledWith('cyberpunk', 2, 'dub');
        expect(await screen.findByText('3 EPISODES', { selector: '.section-label' })).toBeInTheDocument();
        expect(screen.queryByLabelText('Anime name')).not.toBeInTheDocument();
    });
});

describe('AnimeDetail', () => {
    function open(episodes: string[], overrides: Partial<NonNullable<ReturnType<typeof useAnimeStore.getState>['selection']>> = {}): void {
        useAnimeStore.setState({
            search: { ...INITIAL_SEARCH, status: 'done', results: RESULTS, searchedQuery: 'cyberpunk' },
            selection: { result: RESULTS[0] as AnimeSearchResult, query: 'cyberpunk', audio: 'sub', status: 'ready', episodes, error: null, ...overrides }
        });
    }

    it('says it is loading', () => {
        open([], { status: 'loading' });
        render(<AnimeSearch />);
        expect(screen.getByText('LOADING EPISODES…')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /DOWNLOAD/ })).not.toBeInTheDocument();
    });

    it('explains why the episodes could not be loaded', () => {
        open([], { status: 'error', error: { code: 'NETWORK', raw: 'curl exit 6' } });
        render(<AnimeSearch />);
        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent('Network failure. Check your connection and try again.');
        expect(alert).toHaveAttribute('title', 'curl exit 6');
    });

    it('goes back to the results', async () => {
        const user = userEvent.setup();
        open(['1', '2']);
        render(<AnimeSearch />);
        await user.click(screen.getByRole('button', { name: 'BACK' }));
        expect(useAnimeStore.getState().selection).toBeNull();
    });

    it('shows one button per episode and the title', () => {
        open(['1', '2', '3']);
        render(<AnimeSearch />);
        expect(screen.getByRole('region', { name: 'Cyberpunk: Edgerunners' })).toBeInTheDocument();
        expect(
            screen.getAllByRole('button', { name: /^EP \d+$/ }).map((button) => {
                return button.textContent;
            })
        ).toEqual(['EP 1', 'EP 2', 'EP 3']);
        expect(screen.getByRole('button', { name: 'DOWNLOAD SELECTED (0)' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'CLEAR SELECTION' })).toBeDisabled();
    });

    it('downloads the episodes that were picked, in order, and clears the selection', async () => {
        const user = userEvent.setup();
        mock.api.downloadAnime.mockResolvedValue({ ok: true, anime: makeAnime([]) });
        open(['1', '2', '3', '4']);
        render(<AnimeSearch />);

        await user.click(screen.getByRole('button', { name: 'EP 3' }));
        await user.click(screen.getByRole('button', { name: 'EP 1' }));
        await user.click(screen.getByRole('button', { name: 'EP 4' }));
        await user.click(screen.getByRole('button', { name: 'EP 4' }));
        expect(screen.getByRole('button', { name: 'EP 3' })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: 'EP 4' })).toHaveAttribute('aria-pressed', 'false');
        await user.click(screen.getByRole('button', { name: 'DOWNLOAD SELECTED (2)' }));

        expect(mock.api.downloadAnime).toHaveBeenCalledWith({
            title: 'Cyberpunk: Edgerunners',
            query: 'cyberpunk',
            index: 1,
            audio: 'sub',
            episodes: ['1', '3'],
            series: 'Cyberpunk: Edgerunners',
            season: 1,
            seasonName: null
        });
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'DOWNLOAD SELECTED (0)' })).toBeDisabled();
        });
        expect(screen.getByRole('button', { name: 'EP 3' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('downloads the whole season by selecting all and downloading the selection', async () => {
        const user = userEvent.setup();
        mock.api.downloadAnime.mockResolvedValue({ ok: true, anime: makeAnime([]) });
        open(['1', '2', '3']);
        render(<AnimeSearch />);

        await user.click(screen.getByRole('button', { name: 'SELECT ALL' }));
        await user.click(screen.getByRole('button', { name: 'DOWNLOAD SELECTED (3)' }));
        expect(mock.api.downloadAnime).toHaveBeenCalledTimes(1);
        expect(mock.api.downloadAnime).toHaveBeenCalledWith({
            title: 'Cyberpunk: Edgerunners',
            query: 'cyberpunk',
            index: 1,
            audio: 'sub',
            episodes: ['1', '2', '3'],
            series: 'Cyberpunk: Edgerunners',
            season: 1,
            seasonName: null
        });
    });

    it('has no separate button for the whole season', () => {
        open(['1', '2', '3']);
        render(<AnimeSearch />);
        expect(screen.queryByRole('button', { name: /WHOLE SEASON/ })).not.toBeInTheDocument();
    });

    describe('watching without downloading', () => {
        it('needs exactly one episode picked', async () => {
            const user = userEvent.setup();
            open(['1', '2', '3']);
            render(<AnimeSearch />);

            const watch = screen.getByRole('button', { name: 'WATCH' });
            expect(watch).toBeDisabled();
            expect(watch).toHaveAttribute('title', 'Pick one episode to watch it without downloading it.');
            await user.click(screen.getByRole('button', { name: 'EP 2' }));
            expect(watch).toBeEnabled();
            await user.click(screen.getByRole('button', { name: 'EP 3' }));
            expect(watch).toBeDisabled();
            await user.click(screen.getByRole('button', { name: 'EP 3' }));
            expect(watch).toBeEnabled();
        });

        it('opens the episode that was picked, without downloading it', async () => {
            const user = userEvent.setup();
            mock.api.openAnimeStream.mockReturnValue(
                new Promise(() => {
                    return undefined;
                })
            );
            open(['1', '2', '3']);
            render(<AnimeSearch />);

            await user.click(screen.getByRole('button', { name: 'EP 2' }));
            await user.click(screen.getByRole('button', { name: 'WATCH' }));

            expect(mock.api.openAnimeStream).toHaveBeenCalledWith({ query: 'cyberpunk', index: 1, audio: 'sub', episode: '2' });
            expect(useAnimeStore.getState().streaming).toMatchObject({ episode: '2', status: 'loading' });
            expect(mock.api.downloadAnime).not.toHaveBeenCalled();
        });

        it('keeps the picked episode so it can also be downloaded afterwards', async () => {
            const user = userEvent.setup();
            open(['1', '2']);
            render(<AnimeSearch />);
            await user.click(screen.getByRole('button', { name: 'EP 1' }));
            await user.click(screen.getByRole('button', { name: 'WATCH' }));
            expect(screen.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' })).toBeEnabled();
        });
    });

    it('selects all and clears the selection', async () => {
        const user = userEvent.setup();
        open(['1', '2', '3']);
        render(<AnimeSearch />);

        await user.click(screen.getByRole('button', { name: 'SELECT ALL' }));
        expect(screen.getByRole('button', { name: 'DOWNLOAD SELECTED (3)' })).toBeEnabled();
        expect(screen.getByRole('button', { name: 'EP 2' })).toHaveAttribute('aria-pressed', 'true');

        await user.click(screen.getByRole('button', { name: 'CLEAR SELECTION' }));
        expect(screen.getByRole('button', { name: 'DOWNLOAD SELECTED (0)' })).toBeDisabled();
    });

    it('marks the episodes that are already in the library for this audio', () => {
        open(['1', '2', '3']);
        useAnimeStore.setState({
            library: [
                makeAnime([makeEpisode({ id: 1, number: '1' }), makeEpisode({ id: 2, number: '2', status: 'error' })], { title: 'Cyberpunk: Edgerunners', audio: 'sub' }),
                makeAnime([makeEpisode({ id: 3, number: '3' })], { id: 2, title: 'Cyberpunk: Edgerunners', audio: 'dub' })
            ]
        });
        render(<AnimeSearch />);

        expect(screen.getByRole('button', { name: 'EP 1' })).toHaveClass('episode-chip--done');
        expect(screen.getByRole('button', { name: 'EP 1' })).toHaveAttribute('title', 'IN LIBRARY');
        expect(screen.getByRole('button', { name: 'EP 2' })).not.toHaveClass('episode-chip--done');
        expect(screen.getByRole('button', { name: 'EP 2' })).not.toHaveAttribute('title');
        expect(screen.getByRole('button', { name: 'EP 3' })).not.toHaveClass('episode-chip--done');
    });

    it('has a button to the library when the anime has an episode downloaded', async () => {
        const user = userEvent.setup();
        const showInLibrary = vi.fn();
        open(['1', '2']);
        useAnimeStore.setState({ library: [makeAnime([makeEpisode({ id: 1, number: '1' })], { id: 4, title: 'Cyberpunk: Edgerunners', audio: 'sub' })], showInLibrary });
        render(<AnimeSearch />);

        await user.click(screen.getByRole('button', { name: 'VIEW IN LIBRARY' }));
        expect(showInLibrary).toHaveBeenCalledTimes(1);
        expect(showInLibrary).toHaveBeenCalledWith(4);
    });

    it('has no button to the library when nothing of the anime is downloaded for this audio', () => {
        open(['1']);
        useAnimeStore.setState({
            library: [
                makeAnime([makeEpisode({ id: 1, status: 'error' })], { id: 4, title: 'Cyberpunk: Edgerunners', audio: 'sub' }),
                makeAnime([makeEpisode({ id: 2 })], { id: 5, title: 'Cyberpunk: Edgerunners', audio: 'dub' })
            ]
        });
        render(<AnimeSearch />);
        expect(screen.queryByRole('button', { name: 'VIEW IN LIBRARY' })).not.toBeInTheDocument();
    });

    it('goes to the library with that anime open when the button is used', async () => {
        const user = userEvent.setup();
        open(['1']);
        useAnimeStore.setState({ library: [makeAnime([makeEpisode({ id: 1, number: '1' })], { id: 4, title: 'Cyberpunk: Edgerunners', audio: 'sub' })] });
        render(<AnimeSearch />);
        await user.click(screen.getByRole('button', { name: 'VIEW IN LIBRARY' }));
        expect(useAnimeStore.getState()).toMatchObject({ view: 'library', selection: null, libraryFocus: 4 });
    });

    describe('series and season', () => {
        it('suggests the series and the season from the title', () => {
            useAnimeStore.setState({
                search: { ...INITIAL_SEARCH, status: 'done', results: RESULTS, searchedQuery: 'cyberpunk' },
                selection: { result: { index: 3, title: 'Frieren: Beyond Journey\'s End Season 2' }, query: 'frieren', audio: 'sub', status: 'ready', episodes: ['1'], error: null }
            });
            render(<AnimeSearch />);
            expect(screen.getByRole('textbox', { name: 'Series' })).toHaveValue('Frieren: Beyond Journey\'s End');
            expect(screen.getByRole('spinbutton', { name: 'Order' })).toHaveValue(2);
        });

        it('uses the series, the order and the name the anime already has in the library', () => {
            open(['1']);
            useAnimeStore.setState({
                library: [makeAnime([makeEpisode({ id: 1 })], { id: 4, title: 'Cyberpunk: Edgerunners', audio: 'sub', series: 'Cyberpunk', season: 5, seasonName: 'The Fifth' })]
            });
            render(<AnimeSearch />);
            expect(screen.getByRole('textbox', { name: 'Series' })).toHaveValue('Cyberpunk');
            expect(screen.getByRole('spinbutton', { name: 'Order' })).toHaveValue(5);
            expect(screen.getByRole('textbox', { name: 'Name shown' })).toHaveValue('The Fifth');
        });

        it('starts with no name, and says in its hint what is shown instead', () => {
            open(['1']);
            render(<AnimeSearch />);
            const name = screen.getByRole('textbox', { name: 'Name shown' });
            expect(name).toHaveValue('');
            expect(name).toHaveAttribute('placeholder', 'Shown instead of "SEASON 1" (optional)');
        });

        it('does not take more of a name than can be kept', async () => {
            const user = userEvent.setup();
            open(['1']);
            render(<AnimeSearch />);
            await user.type(screen.getByRole('textbox', { name: 'Name shown' }), 'a'.repeat(70));
            expect(screen.getByRole('textbox', { name: 'Name shown' })).toHaveValue('a'.repeat(60));
        });

        it('offers the series of the library, once each, matching what is typed', async () => {
            const user = userEvent.setup();
            open(['1']);
            useAnimeStore.setState({
                library: [
                    makeAnime([], { id: 1, title: 'Bleach', series: 'Bleach', season: 1 }),
                    makeAnime([], { id: 2, title: 'Frieren 2', series: 'Frieren', season: 2 }),
                    makeAnime([], { id: 3, title: 'Frieren', series: 'frieren', season: 1 })
                ]
            });
            render(<AnimeSearch />);
            const field = screen.getByRole('textbox', { name: 'Series' });
            expect(field).toHaveValue('Cyberpunk: Edgerunners');
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

            await user.clear(field);
            expect(
                within(screen.getByRole('listbox', { name: 'In the library' }))
                    .getAllByRole('option')
                    .map((option) => {
                        return option.textContent;
                    })
            ).toEqual(['Bleach', 'Frieren']);
            await user.type(field, 'fri');
            expect(screen.getAllByRole('option')).toHaveLength(1);
        });

        it('puts the series that is picked in the field, and keeps a new name when none is picked', async () => {
            const user = userEvent.setup();
            open(['1']);
            useAnimeStore.setState({ library: [makeAnime([], { id: 2, title: 'Frieren', series: 'Frieren', season: 1 })] });
            render(<AnimeSearch />);
            const field = screen.getByRole('textbox', { name: 'Series' });

            await user.clear(field);
            await user.click(screen.getByRole('option', { name: 'Frieren' }));
            expect(field).toHaveValue('Frieren');
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

            await user.clear(field);
            await user.type(field, 'Brand new');
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
            expect(field).toHaveValue('Brand new');
        });

        it('offers nothing when the library has no series', async () => {
            const user = userEvent.setup();
            open(['1']);
            render(<AnimeSearch />);
            await user.click(screen.getByRole('textbox', { name: 'Series' }));
            expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
        });

        it('downloads under the series and the season that were typed', async () => {
            const user = userEvent.setup();
            mock.api.downloadAnime.mockResolvedValue({ ok: true, anime: makeAnime([]) });
            open(['1', '2']);
            render(<AnimeSearch />);

            await user.clear(screen.getByRole('textbox', { name: 'Series' }));
            await user.type(screen.getByRole('textbox', { name: 'Series' }), 'Cyberpunk');
            await user.clear(screen.getByRole('spinbutton', { name: 'Order' }));
            await user.type(screen.getByRole('spinbutton', { name: 'Order' }), '3');
            await user.type(screen.getByRole('textbox', { name: 'Name shown' }), 'The Third');
            await user.click(screen.getByRole('button', { name: 'EP 2' }));
            await user.click(screen.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }));

            expect(mock.api.downloadAnime).toHaveBeenCalledWith({
                title: 'Cyberpunk: Edgerunners',
                query: 'cyberpunk',
                index: 1,
                audio: 'sub',
                episodes: ['2'],
                series: 'Cyberpunk',
                season: 3,
                seasonName: 'The Third'
            });
        });

        it('downloads on its own when the series is left empty', async () => {
            const user = userEvent.setup();
            mock.api.downloadAnime.mockResolvedValue({ ok: true, anime: makeAnime([]) });
            open(['1']);
            render(<AnimeSearch />);
            await user.clear(screen.getByRole('textbox', { name: 'Series' }));
            await user.click(screen.getByRole('button', { name: 'EP 1' }));
            await user.click(screen.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }));
            expect(mock.api.downloadAnime).toHaveBeenCalledWith({ title: 'Cyberpunk: Edgerunners', query: 'cyberpunk', index: 1, audio: 'sub', episodes: ['1'] });
        });

        it('says so when the season typed is not valid, and downloads nothing', async () => {
            const user = userEvent.setup();
            open(['1']);
            render(<AnimeSearch />);
            await user.clear(screen.getByRole('spinbutton', { name: 'Order' }));
            await user.type(screen.getByRole('spinbutton', { name: 'Order' }), '0');
            await user.click(screen.getByRole('button', { name: 'EP 1' }));
            await user.click(screen.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }));
            expect(mock.api.downloadAnime).not.toHaveBeenCalled();
            expect(useAppStore.getState().notice).toEqual({ kind: 'error', message: 'Give a series name (up to 100 characters), an order from 1 to 99 and a name of up to 60 characters.' });
        });
    });

    it('does not mark anything when the anime is not in the library', () => {
        open(['1']);
        render(<AnimeSearch />);
        expect(screen.getByRole('button', { name: 'EP 1' })).not.toHaveClass('episode-chip--done');
    });
});
