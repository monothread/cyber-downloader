import type { AniRunResult, AnimeSearchResult, LibraryAnime } from '@shared/anime';
import type { ResolvedStream } from '@main/services/aniStream';
import { IPC } from '@shared/constants';
import { MAX_EPISODES_PER_REQUEST, MAX_TEXT_LENGTH, parseDownloadRequest, parseProgress, registerAnimeHandlers, type AnimeHandlerDependencies } from '@main/ipc/registerAnimeHandlers';
import type { IpcMainLike } from '@main/ipc/registerHandlers';
import { AnimeDb } from '@main/services/animeDb';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

function makeIpc(): { ipcMain: IpcMainLike; call: (channel: string, ...args: unknown[]) => unknown; channels: () => string[] } {
    const handlers = new Map<string, Handler>();
    return {
        ipcMain: {
            handle: (channel, listener) => {
                handlers.set(channel, listener);
            }
        },
        call: (channel, ...args) => {
            const handler = handlers.get(channel);
            if (!handler) {
                throw new Error(`No handler for ${channel}`);
            }
            return handler({}, ...args);
        },
        channels: () => {
            return [...handlers.keys()].sort();
        }
    };
}

const ANIME_CHANNELS = [
    IPC.animeCancel,
    IPC.animeClearFinished,
    IPC.animeDownload,
    IPC.animeEpisodes,
    IPC.animeJobs,
    IPC.animeLibrary,
    IPC.animeProgress,
    IPC.animeRemoveAnime,
    IPC.animeRemoveEpisode,
    IPC.animeRetry,
    IPC.animeSearch,
    IPC.animeStatus,
    IPC.animeStreamClose,
    IPC.animeStreamOpen,
    IPC.animeUpdateCli
].sort();

function setup(available = true) {
    const ipc = makeIpc();
    const db = new AnimeDb(':memory:', () => {
        return 5;
    });
    const search = vi.fn(async (): Promise<AniRunResult<AnimeSearchResult[]>> => {
        return { status: 'done', value: [{ index: 1, title: 'Naruto' }] };
    });
    const episodes = vi.fn(async (): Promise<AniRunResult<string[]>> => {
        return { status: 'done', value: ['1', '2'] };
    });
    const updateAniCli = vi.fn(async () => {
        return { ok: true, output: 'Updated ani-cli 5.1.4 → 5.2.0.' };
    });
    const aniCliInfo = { found: true, path: '/app/resources/bin/ani/ani-cli', version: '5.1.4', source: 'bundled' as const };
    const resolveStream = vi.fn(async (): Promise<AniRunResult<ResolvedStream>> => {
        return { status: 'done', value: { url: 'https://cdn.example/master.m3u8', subtitleUrl: null, referer: 'https://embed.example/' } };
    });
    const streams = {
        create: vi.fn(() => {
            return { sessionId: 's1', url: 'pullwave-stream://p/s1/abc', subtitleUrl: null };
        }),
        close: vi.fn()
    };
    const queue = {
        enqueue: vi.fn((request: { title: string }): LibraryAnime | null => {
            const anime = db.upsertAnime({ title: request.title, query: 'naruto', searchIndex: 1, audio: 'sub' });
            return db.getLibraryAnime(anime.id);
        }),
        list: vi.fn(() => {
            return [];
        }),
        cancel: vi.fn(),
        retry: vi.fn(),
        clearFinished: vi.fn(),
        forget: vi.fn()
    };
    const removeFiles = vi.fn();
    const removeFolders = vi.fn();
    const onLibraryChanged = vi.fn();
    const deps = {
        service: { isAvailable: vi.fn(() => { return available; }), info: vi.fn(() => { return aniCliInfo; }), search, episodes, resolveStream },
        updateAniCli,
        streams,
        streamQuality: () => {
            return '720p';
        },
        queue,
        db,
        removeFiles,
        removeFolders,
        baseDirectory: () => {
            return '/lib';
        },
        platform: 'linux',
        onLibraryChanged
    } as unknown as AnimeHandlerDependencies;
    registerAnimeHandlers(ipc.ipcMain, deps);
    return { ...ipc, db, search, episodes, resolveStream, updateAniCli, aniCliInfo, streams, queue, removeFiles, removeFolders, onLibraryChanged, deps };
}

describe('registerAnimeHandlers', () => {
    it('registers every channel of the section', () => {
        expect(setup().channels()).toEqual(ANIME_CHANNELS);
    });

    it('reports whether ani-cli is in place and which one is used', () => {
        const info = { found: true, path: '/app/resources/bin/ani/ani-cli', version: '5.1.4', source: 'bundled' };
        expect(setup(true).call(IPC.animeStatus)).toEqual({ supported: true, available: true, aniCli: info });
        expect(setup(false).call(IPC.animeStatus)).toEqual({ supported: true, available: false, aniCli: info });
    });

    it('updates ani-cli and gives the result as it is', async () => {
        const { call, updateAniCli } = setup();
        expect(await call(IPC.animeUpdateCli)).toEqual({ ok: true, output: 'Updated ani-cli 5.1.4 → 5.2.0.' });
        expect(updateAniCli).toHaveBeenCalledTimes(1);
        expect(updateAniCli).toHaveBeenCalledWith();
    });

    describe('search', () => {
        it('cleans the query and returns the results', async () => {
            const { call, search } = setup();
            expect(await call(IPC.animeSearch, ' -d naruto &', 'dub')).toEqual({ ok: true, results: [{ index: 1, title: 'Naruto' }] });
            expect(search).toHaveBeenCalledWith('d naruto', 'dub');
        });

        it('cuts a very long query', async () => {
            const { call, search } = setup();
            await call(IPC.animeSearch, 'a'.repeat(MAX_TEXT_LENGTH + 50), 'sub');
            expect(search).toHaveBeenCalledWith('a'.repeat(MAX_TEXT_LENGTH), 'sub');
        });

        it('refuses an empty query or an unknown audio without searching', async () => {
            const { call, search } = setup();
            const refusal = { ok: false, error: { code: 'INVALID_SELECTION', raw: 'The search is empty or the audio is invalid.' } };
            expect(await call(IPC.animeSearch, '  &&& ', 'sub')).toEqual(refusal);
            expect(await call(IPC.animeSearch, 'naruto', 'both')).toEqual(refusal);
            expect(await call(IPC.animeSearch, 42, 'sub')).toEqual(refusal);
            expect(search).not.toHaveBeenCalled();
        });

        it('passes on an error', async () => {
            const { call, search } = setup();
            search.mockResolvedValueOnce({ status: 'error', error: { code: 'NO_RESULTS', raw: 'No results found!' } });
            expect(await call(IPC.animeSearch, 'zzz', 'sub')).toEqual({ ok: false, error: { code: 'NO_RESULTS', raw: 'No results found!' } });
        });

        it('reports a cancelled search as an error', async () => {
            const { call, search } = setup();
            search.mockResolvedValueOnce({ status: 'cancelled' });
            expect(await call(IPC.animeSearch, 'zzz', 'sub')).toEqual({ ok: false, error: { code: 'UNKNOWN', raw: 'The search was cancelled.' } });
        });
    });

    describe('episodes', () => {
        it('returns the episodes of the chosen result', async () => {
            const { call, episodes } = setup();
            expect(await call(IPC.animeEpisodes, 'naruto', 2, 'sub')).toEqual({ ok: true, episodes: ['1', '2'] });
            expect(episodes).toHaveBeenCalledWith('naruto', 2, 'sub');
        });

        it('refuses a bad query, position or audio without asking ani-cli', async () => {
            const { call, episodes } = setup();
            const refusal = { ok: false, error: { code: 'INVALID_SELECTION', raw: 'The search, the position or the audio is invalid.' } };
            expect(await call(IPC.animeEpisodes, '', 1, 'sub')).toEqual(refusal);
            expect(await call(IPC.animeEpisodes, 'naruto', 0, 'sub')).toEqual(refusal);
            expect(await call(IPC.animeEpisodes, 'naruto', '1', 'sub')).toEqual(refusal);
            expect(await call(IPC.animeEpisodes, 'naruto', 1, 'x')).toEqual(refusal);
            expect(episodes).not.toHaveBeenCalled();
        });

        it('passes on an error and a cancellation', async () => {
            const { call, episodes } = setup();
            episodes.mockResolvedValueOnce({ status: 'error', error: { code: 'BLOCKED', raw: 'Blocked by cloudflare.' } });
            expect(await call(IPC.animeEpisodes, 'naruto', 1, 'sub')).toEqual({ ok: false, error: { code: 'BLOCKED', raw: 'Blocked by cloudflare.' } });
            episodes.mockResolvedValueOnce({ status: 'cancelled' });
            expect(await call(IPC.animeEpisodes, 'naruto', 1, 'sub')).toEqual({ ok: false, error: { code: 'UNKNOWN', raw: 'The search was cancelled.' } });
        });
    });

    describe('download', () => {
        it('queues the episodes and returns the anime', () => {
            const { call, queue } = setup();
            const response = call(IPC.animeDownload, { title: ' Naruto ', query: '-U naruto', index: 2, audio: 'dub', episodes: ['1', '2', '2'] });

            expect(queue.enqueue).toHaveBeenCalledWith({ title: 'Naruto', query: 'U naruto', index: 2, audio: 'dub', episodes: ['1', '2'] });
            expect(response).toMatchObject({ ok: true, anime: { title: 'Naruto', episodes: [] } });
        });

        it('refuses an invalid request without queueing anything', () => {
            const { call, queue } = setup();
            expect(call(IPC.animeDownload, { title: '', query: 'x', index: 1, audio: 'sub', episodes: ['1'] })).toEqual({ ok: false, message: 'The anime name is missing.' });
            expect(call(IPC.animeDownload, null)).toEqual({ ok: false, message: 'The anime name is missing.' });
            expect(queue.enqueue).not.toHaveBeenCalled();
        });

        it('says so when the library could not return the anime', () => {
            const { call, queue } = setup();
            queue.enqueue.mockReturnValueOnce(null);
            expect(call(IPC.animeDownload, { title: 'Naruto', query: 'naruto', index: 1, audio: 'sub', episodes: ['1'] })).toEqual({
                ok: false,
                message: 'The anime could not be saved.'
            });
        });
    });

    it('lists the library and the jobs', () => {
        const { call, db, queue } = setup();
        const anime = db.upsertAnime({ title: 'Bleach', query: 'bleach', searchIndex: 1, audio: 'sub' });
        db.ensureEpisode(anime.id, '1');
        expect(call(IPC.animeLibrary)).toEqual(db.list());
        expect((call(IPC.animeLibrary) as LibraryAnime[])[0]?.episodes).toHaveLength(1);
        expect(call(IPC.animeJobs)).toEqual([]);
        expect(queue.list).toHaveBeenCalledTimes(1);
    });

    it('cancels, retries and clears through the queue', () => {
        const { call, queue } = setup();
        call(IPC.animeCancel, 4);
        call(IPC.animeRetry, 5);
        call(IPC.animeClearFinished);
        expect(queue.cancel).toHaveBeenCalledWith(4);
        expect(queue.retry).toHaveBeenCalledWith(5);
        expect(queue.clearFinished).toHaveBeenCalledTimes(1);
    });

    it('ignores an id that is not a positive whole number', () => {
        const { call, queue, db } = setup();
        ['4', 0, -1, 1.5, null, undefined, {}].forEach((id) => {
            call(IPC.animeCancel, id);
            call(IPC.animeRetry, id);
            call(IPC.animeRemoveEpisode, id);
            call(IPC.animeRemoveAnime, id);
        });
        expect(queue.cancel).not.toHaveBeenCalled();
        expect(queue.retry).not.toHaveBeenCalled();
        expect(queue.forget).not.toHaveBeenCalled();
        expect(db.list()).toEqual([]);
    });

    describe('removeEpisode', () => {
        function withEpisode() {
            const context = setup();
            const anime = context.db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' });
            const episode = context.db.ensureEpisode(anime.id, '1');
            context.db.markDone(episode.id, '/lib/Naruto/Naruto Episode 1.mp4', 10);
            return { ...context, episode };
        }

        it('forgets the job, removes the record and always deletes the video and its subtitles', () => {
            const { call, db, episode, queue, removeFiles, removeFolders, onLibraryChanged } = withEpisode();
            call(IPC.animeRemoveEpisode, episode.id);

            expect(queue.forget).toHaveBeenCalledWith([episode.id]);
            expect(db.getEpisode(episode.id)).toBeNull();
            expect(removeFiles).toHaveBeenCalledWith(['/lib/Naruto/Naruto Episode 1.mp4', '/lib/Naruto/Naruto Episode 1.vtt']);
            expect(removeFolders).not.toHaveBeenCalled();
            expect(onLibraryChanged).toHaveBeenCalledTimes(1);
        });

        it('has no file to delete for an episode that was never downloaded', () => {
            const { call, db, removeFiles } = setup();
            const episode = db.ensureEpisode(db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' }).id, '1');
            call(IPC.animeRemoveEpisode, episode.id);
            expect(db.getEpisode(episode.id)).toBeNull();
            expect(removeFiles).not.toHaveBeenCalled();
        });
    });

    describe('removeAnime', () => {
        it('forgets the jobs, removes the anime, deletes every video and subtitle and then its folder', () => {
            const { call, db, queue, removeFiles, removeFolders, onLibraryChanged } = setup();
            const anime = db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' });
            const first = db.ensureEpisode(anime.id, '1');
            const second = db.ensureEpisode(anime.id, '2');
            db.ensureEpisode(anime.id, '3');
            db.markDone(first.id, '/lib/Naruto/1.mp4', 1);
            db.markDone(second.id, '/lib/Naruto/2.mkv', 1);

            call(IPC.animeRemoveAnime, anime.id);

            expect(queue.forget).toHaveBeenCalledWith([first.id, second.id, 3]);
            expect(db.getAnime(anime.id)).toBeNull();
            expect(removeFiles).toHaveBeenCalledWith(['/lib/Naruto/1.mp4', '/lib/Naruto/1.vtt', '/lib/Naruto/2.mkv', '/lib/Naruto/2.vtt']);
            expect(removeFolders).toHaveBeenCalledWith(['/lib/Naruto']);
            expect(onLibraryChanged).toHaveBeenCalledTimes(1);
        });

        it('also removes the folder of an anime that has nothing downloaded', () => {
            const { call, db, removeFiles, removeFolders } = setup();
            const anime = db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' });
            db.ensureEpisode(anime.id, '1');
            call(IPC.animeRemoveAnime, anime.id);
            expect(removeFiles).toHaveBeenCalledWith([]);
            expect(removeFolders).toHaveBeenCalledWith(['/lib/Naruto']);
        });

        it('never removes a folder that is not named after the anime', () => {
            const { call, db, removeFolders } = setup();
            const anime = db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' });
            db.markDone(db.ensureEpisode(anime.id, '1').id, '/home/me/Videos/1.mp4', 1);
            call(IPC.animeRemoveAnime, anime.id);
            expect(removeFolders).toHaveBeenCalledWith(['/lib/Naruto']);
        });

        it('does nothing for an anime that does not exist', () => {
            const { call, queue, removeFiles, removeFolders, onLibraryChanged } = setup();
            call(IPC.animeRemoveAnime, 99);
            expect(queue.forget).not.toHaveBeenCalled();
            expect(removeFiles).not.toHaveBeenCalled();
            expect(removeFolders).not.toHaveBeenCalled();
            expect(onLibraryChanged).not.toHaveBeenCalled();
        });
    });

    describe('watching without downloading', () => {
        const request = { query: ' -d naruto ', index: 2, audio: 'dub', episode: '4' };

        it('finds the video with the quality of the settings and opens a stream for it', async () => {
            const { call, resolveStream, streams } = setup();
            expect(await call(IPC.animeStreamOpen, request)).toEqual({ ok: true, stream: { sessionId: 's1', url: 'pullwave-stream://p/s1/abc', subtitleUrl: null } });
            expect(resolveStream).toHaveBeenCalledWith({ query: 'd naruto', index: 2, audio: 'dub', episode: '4', quality: '720p' });
            expect(streams.create).toHaveBeenCalledWith({ url: 'https://cdn.example/master.m3u8', subtitleUrl: null, referer: 'https://embed.example/' });
        });

        it('refuses an invalid request without asking ani-cli', async () => {
            const { call, resolveStream } = setup();
            const refusal = { ok: false, error: { code: 'INVALID_SELECTION', raw: 'The search, the position, the audio or the episode is invalid.' } };
            expect(await call(IPC.animeStreamOpen, { ...request, query: '&&&' })).toEqual(refusal);
            expect(await call(IPC.animeStreamOpen, { ...request, audio: 'both' })).toEqual(refusal);
            expect(await call(IPC.animeStreamOpen, { ...request, index: 0 })).toEqual(refusal);
            expect(await call(IPC.animeStreamOpen, { ...request, index: '2' })).toEqual(refusal);
            expect(await call(IPC.animeStreamOpen, { ...request, episode: '1-3' })).toEqual(refusal);
            expect(await call(IPC.animeStreamOpen, null)).toEqual(refusal);
            expect(resolveStream).not.toHaveBeenCalled();
        });

        it('passes on an error and treats a cancellation as one', async () => {
            const { call, resolveStream, streams } = setup();
            resolveStream.mockResolvedValueOnce({ status: 'error', error: { code: 'NO_SOURCES', raw: 'No sources found for dub!' } });
            expect(await call(IPC.animeStreamOpen, request)).toEqual({ ok: false, error: { code: 'NO_SOURCES', raw: 'No sources found for dub!' } });
            resolveStream.mockResolvedValueOnce({ status: 'cancelled' });
            expect(await call(IPC.animeStreamOpen, request)).toEqual({ ok: false, error: { code: 'UNKNOWN', raw: 'The request was cancelled.' } });
            expect(streams.create).not.toHaveBeenCalled();
        });

        it('closes the stream of a session', () => {
            const { call, streams } = setup();
            call(IPC.animeStreamClose, 's1');
            expect(streams.close).toHaveBeenCalledWith('s1');
        });

        it('ignores a session id that is not text or is empty', () => {
            const { call, streams } = setup();
            call(IPC.animeStreamClose, 5);
            call(IPC.animeStreamClose, '');
            call(IPC.animeStreamClose, undefined);
            expect(streams.close).not.toHaveBeenCalled();
        });
    });

    it('saves the progress of an episode and ignores an invalid update', () => {
        const { call, db } = setup();
        const episode = db.ensureEpisode(db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' }).id, '1');
        call(IPC.animeProgress, { episodeId: episode.id, positionSeconds: 30, durationSeconds: 1400, watched: false });
        expect(db.getEpisode(episode.id)).toMatchObject({ positionSeconds: 30, durationSeconds: 1400, watched: false });

        call(IPC.animeProgress, { episodeId: episode.id, positionSeconds: -1, durationSeconds: 1400, watched: true });
        expect(db.getEpisode(episode.id)).toMatchObject({ positionSeconds: 30, watched: false });
    });
});

describe('registerAnimeHandlers where the section does not exist', () => {
    it('answers that it is unsupported and does nothing else', async () => {
        const ipc = makeIpc();
        registerAnimeHandlers(ipc.ipcMain, null);
        const unsupported = { code: 'UNKNOWN', raw: 'The anime section is only available on Linux.' };

        expect(ipc.channels()).toEqual(ANIME_CHANNELS);
        expect(ipc.call(IPC.animeStatus)).toEqual({ supported: false, available: false, aniCli: null });
        expect(ipc.call(IPC.animeUpdateCli)).toEqual({ ok: false, output: unsupported.raw });
        expect(ipc.call(IPC.animeSearch, 'naruto', 'sub')).toEqual({ ok: false, error: unsupported });
        expect(ipc.call(IPC.animeEpisodes, 'naruto', 1, 'sub')).toEqual({ ok: false, error: unsupported });
        expect(ipc.call(IPC.animeDownload, {})).toEqual({ ok: false, message: unsupported.raw });
        expect(ipc.call(IPC.animeLibrary)).toEqual([]);
        expect(ipc.call(IPC.animeJobs)).toEqual([]);
        expect(ipc.call(IPC.animeStreamOpen, {})).toEqual({ ok: false, error: unsupported });
        [IPC.animeCancel, IPC.animeRetry, IPC.animeClearFinished, IPC.animeRemoveEpisode, IPC.animeRemoveAnime, IPC.animeProgress, IPC.animeStreamClose].forEach((channel) => {
            expect(ipc.call(channel, 1)).toBeUndefined();
        });
    });
});

describe('parseDownloadRequest', () => {
    const valid = { title: 'Naruto', query: 'naruto', index: 1, audio: 'sub', episodes: ['1'] };

    it('accepts a valid request and cleans it', () => {
        expect(parseDownloadRequest(valid)).toEqual({ title: 'Naruto', query: 'naruto', index: 1, audio: 'sub', episodes: ['1'] });
        expect(parseDownloadRequest({ ...valid, title: '  Naruto  ', episodes: ['1', '1.5', '1'] })).toEqual({
            title: 'Naruto',
            query: 'naruto',
            index: 1,
            audio: 'sub',
            episodes: ['1', '1.5']
        });
    });

    it('cuts a very long title', () => {
        expect(parseDownloadRequest({ ...valid, title: 'a'.repeat(500) })).toMatchObject({ title: 'a'.repeat(MAX_TEXT_LENGTH) });
    });

    it('needs a title and a usable query', () => {
        const message = 'The anime name is missing.';
        expect(parseDownloadRequest({ ...valid, title: '   ' })).toBe(message);
        expect(parseDownloadRequest({ ...valid, title: 3 })).toBe(message);
        expect(parseDownloadRequest({ ...valid, query: '&&&' })).toBe(message);
        expect(parseDownloadRequest({ ...valid, query: undefined })).toBe(message);
        expect(parseDownloadRequest(undefined)).toBe(message);
        expect(parseDownloadRequest('naruto')).toBe(message);
    });

    it('needs a known audio', () => {
        expect(parseDownloadRequest({ ...valid, audio: 'both' })).toBe('The audio must be sub or dub.');
        expect(parseDownloadRequest({ ...valid, audio: undefined })).toBe('The audio must be sub or dub.');
    });

    it('needs a valid position', () => {
        const message = 'The position of the anime in the search is invalid.';
        expect(parseDownloadRequest({ ...valid, index: 0 })).toBe(message);
        expect(parseDownloadRequest({ ...valid, index: '1' })).toBe(message);
        expect(parseDownloadRequest({ ...valid, index: 1.5 })).toBe(message);
    });

    it('needs valid episodes, and not too many', () => {
        const message = 'The episodes are invalid.';
        expect(parseDownloadRequest({ ...valid, episodes: [] })).toBe(message);
        expect(parseDownloadRequest({ ...valid, episodes: 'all' })).toBe(message);
        expect(parseDownloadRequest({ ...valid, episodes: ['1', '-d'] })).toBe(message);
        expect(parseDownloadRequest({ ...valid, episodes: [1] })).toBe(message);
        const many = Array.from({ length: MAX_EPISODES_PER_REQUEST + 1 }, (_value, position) => {
            return String(position + 1);
        });
        expect(parseDownloadRequest({ ...valid, episodes: many })).toBe(message);
        expect(parseDownloadRequest({ ...valid, episodes: many.slice(0, MAX_EPISODES_PER_REQUEST) })).toMatchObject({ audio: 'sub' });
    });
});

describe('parseProgress', () => {
    const valid = { episodeId: 3, positionSeconds: 12.5, durationSeconds: 1400, watched: true };

    it('accepts a valid update', () => {
        expect(parseProgress(valid)).toEqual(valid);
        expect(parseProgress({ ...valid, positionSeconds: 0, durationSeconds: 0 })).toEqual({ ...valid, positionSeconds: 0, durationSeconds: 0 });
    });

    it('rejects everything else', () => {
        expect(parseProgress(null)).toBeNull();
        expect(parseProgress('x')).toBeNull();
        expect(parseProgress({ ...valid, episodeId: 0 })).toBeNull();
        expect(parseProgress({ ...valid, episodeId: '3' })).toBeNull();
        expect(parseProgress({ ...valid, positionSeconds: '1' })).toBeNull();
        expect(parseProgress({ ...valid, durationSeconds: undefined })).toBeNull();
        expect(parseProgress({ ...valid, watched: 1 })).toBeNull();
        expect(parseProgress({ ...valid, positionSeconds: Number.NaN })).toBeNull();
        expect(parseProgress({ ...valid, durationSeconds: Number.POSITIVE_INFINITY })).toBeNull();
        expect(parseProgress({ ...valid, positionSeconds: -1 })).toBeNull();
        expect(parseProgress({ ...valid, durationSeconds: -1 })).toBeNull();
    });
});
