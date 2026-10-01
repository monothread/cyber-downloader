// @vitest-environment jsdom
import type { AnimeJob, AnimeSearchResult } from '@shared/anime';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { useAppStore } from '@renderer/store/appStore';
import { effectiveAudio, INITIAL_SEARCH, UNSUPPORTED_STATUS, useAnimeStore } from '@renderer/store/animeStore';
import { makeAnime, makeAnimeJob, makeEpisode, makeStatus } from '../../helpers/animeFixtures';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initialApp = useAppStore.getState();
const initialAnime = useAnimeStore.getState();

const RESULT: AnimeSearchResult = { index: 2, title: 'Naruto' };
const SUPPORTED = makeStatus();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initialApp, settings: DEFAULT_SETTINGS, notice: null });
    useAnimeStore.setState({ ...initialAnime, status: UNSUPPORTED_STATUS, updatingCli: false, view: 'search', returnView: 'search', jobs: [], library: [], search: INITIAL_SEARCH, selection: null, playing: null, streaming: null });
});

describe('effectiveAudio', () => {
    it('uses the audio picked on the screen, or the setting when none was picked', () => {
        expect(effectiveAudio({ ...INITIAL_SEARCH, audio: 'dub' }, 'sub')).toBe('dub');
        expect(effectiveAudio(INITIAL_SEARCH, 'dub')).toBe('dub');
        expect(effectiveAudio({ ...INITIAL_SEARCH, audio: 'sub' }, 'dub')).toBe('sub');
    });
});

describe('useAnimeStore initial state', () => {
    it('starts unsupported and empty', () => {
        expect(initialAnime.status).toEqual({ supported: false, available: false, aniCli: null });
        expect(initialAnime.updatingCli).toBe(false);
        expect(initialAnime.view).toBe('search');
        expect(initialAnime.returnView).toBe('search');
        expect(initialAnime.jobs).toEqual([]);
        expect(initialAnime.library).toEqual([]);
        expect(initialAnime.search).toEqual({ query: '', audio: null, status: 'idle', results: [], error: null, searchedQuery: '', searchedAudio: 'sub' });
        expect(initialAnime.selection).toBeNull();
        expect(initialAnime.playing).toBeNull();
        expect(initialAnime.streaming).toBeNull();
    });
});

describe('init', () => {
    it('only asks for the status where the section does not exist', async () => {
        const dispose = await useAnimeStore.getState().init();
        expect(useAnimeStore.getState().status).toEqual({ supported: false, available: false, aniCli: null });
        expect(mock.api.listAnimeLibrary).not.toHaveBeenCalled();
        expect(mock.api.listAnimeJobs).not.toHaveBeenCalled();
        expect(mock.api.onAnimeJobUpdate).not.toHaveBeenCalled();
        expect(() => {
            dispose();
        }).not.toThrow();
    });

    it('loads the library and the jobs and listens for changes', async () => {
        const anime = makeAnime([makeEpisode()]);
        const job = makeAnimeJob();
        mock.api.getAnimeStatus.mockResolvedValue(SUPPORTED);
        mock.api.listAnimeLibrary.mockResolvedValue([anime]);
        mock.api.listAnimeJobs.mockResolvedValue([job]);

        const dispose = await useAnimeStore.getState().init();

        expect(useAnimeStore.getState().status).toEqual(SUPPORTED);
        expect(useAnimeStore.getState().library).toEqual([anime]);
        expect(useAnimeStore.getState().jobs).toEqual([job]);

        const updated: AnimeJob = { ...job, percent: 80 };
        const other = makeAnimeJob({ episodeId: 2, episode: '2' });
        mock.emitAnimeJob(updated);
        mock.emitAnimeJob(other);
        expect(useAnimeStore.getState().jobs).toEqual([updated, other]);

        mock.api.listAnimeLibrary.mockResolvedValue([]);
        mock.emitAnimeLibraryChanged();
        await vi.waitFor(() => {
            expect(useAnimeStore.getState().library).toEqual([]);
        });

        dispose();
        expect(mock.unsubscribers).toHaveLength(2);
        mock.unsubscribers.forEach((unsubscribe) => {
            expect(unsubscribe).toHaveBeenCalledTimes(1);
        });
    });
});

describe('updateCli', () => {
    it('updates ani-cli, reads the new version and tells the user', async () => {
        const updated = { found: true, path: '/data/bin/ani-cli', version: '5.2.0', source: 'updated' as const };
        mock.api.updateAniCli.mockResolvedValue({ ok: true, output: 'Updated ani-cli 5.1.4 → 5.2.0.' });
        mock.api.getAnimeStatus.mockResolvedValue(makeStatus({ aniCli: updated }));

        const updating = useAnimeStore.getState().updateCli();
        expect(useAnimeStore.getState().updatingCli).toBe(true);
        await updating;

        expect(useAnimeStore.getState().updatingCli).toBe(false);
        expect(useAnimeStore.getState().status.aniCli).toEqual(updated);
        expect(useAppStore.getState().notice).toEqual({ kind: 'info', message: 'Updated ani-cli 5.1.4 → 5.2.0.' });
    });

    it('tells the user when the update failed', async () => {
        mock.api.updateAniCli.mockResolvedValue({ ok: false, output: 'getaddrinfo ENOTFOUND' });
        mock.api.getAnimeStatus.mockResolvedValue(makeStatus());
        await useAnimeStore.getState().updateCli();
        expect(useAnimeStore.getState().updatingCli).toBe(false);
        expect(useAppStore.getState().notice).toEqual({ kind: 'error', message: 'getaddrinfo ENOTFOUND' });
    });

    it('says something even when the result has no text', async () => {
        mock.api.getAnimeStatus.mockResolvedValue(makeStatus());
        mock.api.updateAniCli.mockResolvedValue({ ok: true, output: '' });
        await useAnimeStore.getState().updateCli();
        expect(useAppStore.getState().notice).toEqual({ kind: 'info', message: 'yt-dlp is up to date.' });
        mock.api.updateAniCli.mockResolvedValue({ ok: false, output: '' });
        await useAnimeStore.getState().updateCli();
        expect(useAppStore.getState().notice).toEqual({ kind: 'error', message: 'Update failed.' });
    });
});

describe('simple setters', () => {
    it('sets the view, the query and the audio', () => {
        useAnimeStore.getState().setView('library');
        useAnimeStore.getState().setQuery('bleach');
        useAnimeStore.getState().setAudio('dub');
        expect(useAnimeStore.getState().view).toBe('library');
        expect(useAnimeStore.getState().search).toMatchObject({ query: 'bleach', audio: 'dub' });
    });

    it('remembers the view the downloads screen goes back to', () => {
        useAnimeStore.getState().setView('library');
        useAnimeStore.getState().openDownloads();
        expect(useAnimeStore.getState()).toMatchObject({ view: 'downloads', returnView: 'library' });
        useAnimeStore.getState().closeDownloads();
        expect(useAnimeStore.getState().view).toBe('library');

        useAnimeStore.getState().setView('search');
        useAnimeStore.getState().openDownloads();
        useAnimeStore.getState().closeDownloads();
        expect(useAnimeStore.getState().view).toBe('search');
    });

    it('does not forget where to go back when the downloads screen is opened twice', () => {
        useAnimeStore.getState().setView('library');
        useAnimeStore.getState().openDownloads();
        useAnimeStore.getState().openDownloads();
        useAnimeStore.getState().closeDownloads();
        expect(useAnimeStore.getState().view).toBe('library');
    });

    it('opens and closes the player', () => {
        useAnimeStore.getState().play(3, 7);
        expect(useAnimeStore.getState().playing).toEqual({ animeId: 3, episodeId: 7 });
        useAnimeStore.getState().closePlayer();
        expect(useAnimeStore.getState().playing).toBeNull();
    });
});

describe('runSearch', () => {
    it('does nothing for an empty query', async () => {
        useAnimeStore.getState().setQuery('   ');
        await useAnimeStore.getState().runSearch();
        expect(mock.api.searchAnime).not.toHaveBeenCalled();
        expect(useAnimeStore.getState().search.status).toBe('idle');
    });

    it('searches with the audio of the settings and keeps the results with what they belong to', async () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, animeAudio: 'dub' } });
        mock.api.searchAnime.mockResolvedValue({ ok: true, results: [RESULT] });
        useAnimeStore.getState().setQuery('  naruto ');

        const running = useAnimeStore.getState().runSearch();
        expect(useAnimeStore.getState().search.status).toBe('searching');
        await running;

        expect(mock.api.searchAnime).toHaveBeenCalledWith('naruto', 'dub');
        expect(useAnimeStore.getState().search).toMatchObject({ status: 'done', results: [RESULT], searchedQuery: 'naruto', searchedAudio: 'dub', error: null });
    });

    it('prefers the audio picked on the screen', async () => {
        mock.api.searchAnime.mockResolvedValue({ ok: true, results: [] });
        useAnimeStore.getState().setQuery('naruto');
        useAnimeStore.getState().setAudio('dub');
        await useAnimeStore.getState().runSearch();
        expect(mock.api.searchAnime).toHaveBeenCalledWith('naruto', 'dub');
    });

    it('clears the opened anime and the previous results while it searches', async () => {
        useAnimeStore.setState({
            selection: { result: RESULT, query: 'x', audio: 'sub', status: 'ready', episodes: ['1'], error: null },
            search: { ...INITIAL_SEARCH, query: 'naruto', results: [RESULT], status: 'done' }
        });
        mock.api.searchAnime.mockResolvedValue({ ok: true, results: [] });
        const running = useAnimeStore.getState().runSearch();
        expect(useAnimeStore.getState().selection).toBeNull();
        expect(useAnimeStore.getState().search.results).toEqual([]);
        await running;
    });

    it('keeps the error of a failed search', async () => {
        const error = { code: 'NO_RESULTS' as const, raw: 'No results found!' };
        mock.api.searchAnime.mockResolvedValue({ ok: false, error });
        useAnimeStore.getState().setQuery('zzz');
        await useAnimeStore.getState().runSearch();
        expect(useAnimeStore.getState().search).toMatchObject({ status: 'error', error, results: [], searchedQuery: 'zzz', searchedAudio: 'sub' });
    });
});

describe('openResult and closeResult', () => {
    beforeEach(() => {
        useAnimeStore.setState({ search: { ...INITIAL_SEARCH, results: [RESULT], status: 'done', searchedQuery: 'naruto', searchedAudio: 'dub' } });
    });

    it('loads the episodes of the result for the search it came from', async () => {
        mock.api.listAnimeEpisodes.mockResolvedValue({ ok: true, episodes: ['1', '2'] });
        const opening = useAnimeStore.getState().openResult(RESULT);
        expect(useAnimeStore.getState().selection).toEqual({ result: RESULT, query: 'naruto', audio: 'dub', status: 'loading', episodes: [], error: null });
        await opening;

        expect(mock.api.listAnimeEpisodes).toHaveBeenCalledWith('naruto', 2, 'dub');
        expect(useAnimeStore.getState().selection).toEqual({ result: RESULT, query: 'naruto', audio: 'dub', status: 'ready', episodes: ['1', '2'], error: null });
    });

    it('keeps the error when the episodes cannot be loaded', async () => {
        const error = { code: 'BLOCKED' as const, raw: 'Blocked by cloudflare.' };
        mock.api.listAnimeEpisodes.mockResolvedValue({ ok: false, error });
        await useAnimeStore.getState().openResult(RESULT);
        expect(useAnimeStore.getState().selection).toMatchObject({ status: 'error', error, episodes: [] });
    });

    it('ignores the answer when the user went back or opened another result meanwhile', async () => {
        let answer: (value: { ok: true; episodes: string[] }) => void = () => {
            return undefined;
        };
        mock.api.listAnimeEpisodes.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve;
            })
        );
        const opening = useAnimeStore.getState().openResult(RESULT);
        useAnimeStore.getState().closeResult();
        answer({ ok: true, episodes: ['1'] });
        await opening;
        expect(useAnimeStore.getState().selection).toBeNull();
    });

    it('closes the opened anime', () => {
        useAnimeStore.setState({ selection: { result: RESULT, query: 'naruto', audio: 'sub', status: 'ready', episodes: [], error: null } });
        useAnimeStore.getState().closeResult();
        expect(useAnimeStore.getState().selection).toBeNull();
    });
});

describe('downloadEpisodes', () => {
    const selection = { result: RESULT, query: 'naruto', audio: 'dub' as const, status: 'ready' as const, episodes: ['1', '2'], error: null };

    it('does nothing without an opened anime or without episodes', async () => {
        await useAnimeStore.getState().downloadEpisodes(['1']);
        useAnimeStore.setState({ selection });
        await useAnimeStore.getState().downloadEpisodes([]);
        expect(mock.api.downloadAnime).not.toHaveBeenCalled();
    });

    it('queues the episodes and says so', async () => {
        mock.api.downloadAnime.mockResolvedValue({ ok: true, anime: makeAnime([], { title: 'Naruto' }) });
        useAnimeStore.setState({ selection });

        await useAnimeStore.getState().downloadEpisodes(['1', '2']);

        expect(mock.api.downloadAnime).toHaveBeenCalledWith({ title: 'Naruto', query: 'naruto', index: 2, audio: 'dub', episodes: ['1', '2'] });
        expect(useAppStore.getState().notice).toEqual({ kind: 'info', message: 'Queued 2 episode(s) of Naruto.' });
    });

    it('says why the download could not be queued', async () => {
        mock.api.downloadAnime.mockResolvedValue({ ok: false, message: 'The episodes are invalid.' });
        useAnimeStore.setState({ selection });
        await useAnimeStore.getState().downloadEpisodes(['1']);
        expect(useAppStore.getState().notice).toEqual({ kind: 'error', message: 'Could not queue the download: The episodes are invalid.' });
    });

    it('writes the notice in the language of the settings', async () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, language: 'pt' } });
        mock.api.downloadAnime.mockResolvedValue({ ok: true, anime: makeAnime([], { title: 'Naruto' }) });
        useAnimeStore.setState({ selection });
        await useAnimeStore.getState().downloadEpisodes(['1']);
        expect(useAppStore.getState().notice).toEqual({ kind: 'info', message: '1 episódio(s) de Naruto na fila.' });
    });
});

describe('watching without downloading', () => {
    const selection = { result: RESULT, query: 'naruto', audio: 'dub' as const, status: 'ready' as const, episodes: ['1', '2'], error: null };
    const STREAM = { sessionId: 's1', url: 'pullwave-stream://p/s1/abc', subtitleUrl: null };

    it('does nothing without an opened anime', async () => {
        await useAnimeStore.getState().watchEpisode('1');
        expect(mock.api.openAnimeStream).not.toHaveBeenCalled();
        expect(useAnimeStore.getState().streaming).toBeNull();
    });

    it('shows that the video is being found and then plays it', async () => {
        mock.api.openAnimeStream.mockResolvedValue({ ok: true, stream: STREAM });
        useAnimeStore.setState({ selection });

        const watching = useAnimeStore.getState().watchEpisode('2');
        expect(useAnimeStore.getState().streaming).toEqual({ title: 'Naruto', episode: '2', status: 'loading', stream: null, error: null });
        await watching;

        expect(mock.api.openAnimeStream).toHaveBeenCalledWith({ query: 'naruto', index: 2, audio: 'dub', episode: '2' });
        expect(useAnimeStore.getState().streaming).toEqual({ title: 'Naruto', episode: '2', status: 'ready', stream: STREAM, error: null });
    });

    it('keeps the error when the video cannot be found', async () => {
        const error = { code: 'NO_SOURCES' as const, raw: 'No sources found for dub!' };
        mock.api.openAnimeStream.mockResolvedValue({ ok: false, error });
        useAnimeStore.setState({ selection });
        await useAnimeStore.getState().watchEpisode('1');
        expect(useAnimeStore.getState().streaming).toEqual({ title: 'Naruto', episode: '1', status: 'error', stream: null, error });
    });

    it('drops a stream that arrives after the user closed the player', async () => {
        let answer: (value: { ok: true; stream: typeof STREAM }) => void = () => {
            return undefined;
        };
        mock.api.openAnimeStream.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve;
            })
        );
        useAnimeStore.setState({ selection });
        const watching = useAnimeStore.getState().watchEpisode('1');
        useAnimeStore.getState().closeStream();
        answer({ ok: true, stream: STREAM });
        await watching;

        expect(useAnimeStore.getState().streaming).toBeNull();
        expect(mock.api.closeAnimeStream).toHaveBeenCalledWith('s1');
    });

    it('ignores a failure that arrives after the user closed the player', async () => {
        let answer: (value: { ok: false; error: { code: 'NETWORK'; raw: string } }) => void = () => {
            return undefined;
        };
        mock.api.openAnimeStream.mockReturnValue(
            new Promise((resolve) => {
                answer = resolve;
            })
        );
        useAnimeStore.setState({ selection });
        const watching = useAnimeStore.getState().watchEpisode('1');
        useAnimeStore.getState().closeStream();
        answer({ ok: false, error: { code: 'NETWORK', raw: 'x' } });
        await watching;
        expect(useAnimeStore.getState().streaming).toBeNull();
        expect(mock.api.closeAnimeStream).not.toHaveBeenCalled();
    });

    it('closes the stream the main process opened', () => {
        useAnimeStore.setState({ streaming: { title: 'Naruto', episode: '1', status: 'ready', stream: STREAM, error: null } });
        useAnimeStore.getState().closeStream();
        expect(mock.api.closeAnimeStream).toHaveBeenCalledWith('s1');
        expect(useAnimeStore.getState().streaming).toBeNull();
    });

    it('has nothing to tell the main process when no stream was opened yet', () => {
        useAnimeStore.setState({ streaming: { title: 'Naruto', episode: '1', status: 'loading', stream: null, error: null } });
        useAnimeStore.getState().closeStream();
        useAnimeStore.getState().closeStream();
        expect(mock.api.closeAnimeStream).not.toHaveBeenCalled();
        expect(useAnimeStore.getState().streaming).toBeNull();
    });
});

describe('jobs and library actions', () => {
    it('cancels and retries through the api', async () => {
        await useAnimeStore.getState().cancelJob(4);
        await useAnimeStore.getState().retryJob(5);
        expect(mock.api.cancelAnimeJob).toHaveBeenCalledWith(4);
        expect(mock.api.retryAnimeJob).toHaveBeenCalledWith(5);
    });

    it('clears the finished jobs and takes the list the main process kept', async () => {
        useAnimeStore.setState({ jobs: [makeAnimeJob({ status: 'done' }), makeAnimeJob({ episodeId: 2, status: 'running' })] });
        mock.api.listAnimeJobs.mockResolvedValue([makeAnimeJob({ episodeId: 2, status: 'running' })]);
        await useAnimeStore.getState().clearFinishedJobs();
        expect(mock.api.clearFinishedAnimeJobs).toHaveBeenCalledTimes(1);
        expect(useAnimeStore.getState().jobs).toEqual([makeAnimeJob({ episodeId: 2, status: 'running' })]);
    });

    it('removes an episode and drops its job', async () => {
        useAnimeStore.setState({ jobs: [makeAnimeJob({ episodeId: 1 }), makeAnimeJob({ episodeId: 2 })] });
        await useAnimeStore.getState().removeEpisode(1);
        expect(mock.api.removeAnimeEpisode).toHaveBeenCalledWith(1);
        expect(useAnimeStore.getState().jobs).toEqual([makeAnimeJob({ episodeId: 2 })]);
    });

    it('removes an anime and drops the jobs of its episodes', async () => {
        useAnimeStore.setState({ jobs: [makeAnimeJob({ episodeId: 1, animeId: 1 }), makeAnimeJob({ episodeId: 2, animeId: 2 })] });
        await useAnimeStore.getState().removeAnime(1);
        expect(mock.api.removeAnime).toHaveBeenCalledWith(1);
        expect(useAnimeStore.getState().jobs).toEqual([makeAnimeJob({ episodeId: 2, animeId: 2 })]);
    });

    it('saves the progress and refreshes the library', async () => {
        const update = { episodeId: 3, positionSeconds: 12, durationSeconds: 1400, watched: false };
        await useAnimeStore.getState().saveProgress(update);
        expect(mock.api.saveAnimeProgress).toHaveBeenCalledWith(update);

        const anime = makeAnime([makeEpisode({ positionSeconds: 12 })]);
        mock.api.listAnimeLibrary.mockResolvedValue([anime]);
        await useAnimeStore.getState().refreshLibrary();
        expect(useAnimeStore.getState().library).toEqual([anime]);
    });
});
