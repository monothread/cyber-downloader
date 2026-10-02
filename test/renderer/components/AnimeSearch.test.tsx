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

        expect(mock.api.downloadAnime).toHaveBeenCalledWith({ title: 'Cyberpunk: Edgerunners', query: 'cyberpunk', index: 1, audio: 'sub', episodes: ['1', '3'] });
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
        expect(mock.api.downloadAnime).toHaveBeenCalledWith({ title: 'Cyberpunk: Edgerunners', query: 'cyberpunk', index: 1, audio: 'sub', episodes: ['1', '2', '3'] });
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

    it('does not mark anything when the anime is not in the library', () => {
        open(['1']);
        render(<AnimeSearch />);
        expect(screen.getByRole('button', { name: 'EP 1' })).not.toHaveClass('episode-chip--done');
    });
});
