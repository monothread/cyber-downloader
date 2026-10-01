import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnimeJob } from '@shared/anime';
import { DEFAULT_SETTINGS, IPC } from '@shared/constants';
import { createAnimeRuntime, type AnimeRuntimeOptions } from '@main/animeRuntime';
import { AnimeDb } from '@main/services/animeDb';
import { BinaryResolver } from '@main/services/binaryResolver';
import { cleanTempDirs, makeTempDir } from '../helpers/tempDir';

afterEach(() => {
    cleanTempDirs();
});

function options(overrides: Partial<AnimeRuntimeOptions> = {}) {
    const root = makeTempDir();
    const send = vi.fn();
    const base: AnimeRuntimeOptions = {
        platform: 'linux',
        dataDir: join(root, 'data'),
        bundledDir: join(root, 'resources', 'bin'),
        scriptsDir: join(root, 'resources', 'ani-scripts'),
        defaultDownloadDir: join(root, 'Downloads'),
        systemLocale: 'en-US',
        resolver: new BinaryResolver({ bundledDir: join(root, 'resources', 'bin'), userBinDir: join(root, 'data', 'bin') }),
        getSettings: () => {
            return DEFAULT_SETTINGS;
        },
        send
    };
    return { root, send, options: { ...base, ...overrides } };
}

async function flush(): Promise<void> {
    await new Promise((resolve) => {
        setTimeout(resolve, 20);
    });
}

describe('createAnimeRuntime', () => {
    it('does not exist outside Linux', () => {
        expect(createAnimeRuntime(options({ platform: 'win32' }).options)).toBeNull();
        expect(createAnimeRuntime(options({ platform: 'darwin' }).options)).toBeNull();
    });

    it('creates the library under the data folder', () => {
        const { root, options: given } = options();
        const runtime = createAnimeRuntime(given);
        expect(runtime).not.toBeNull();
        expect(existsSync(join(root, 'data', 'anime', 'anime.db'))).toBe(true);
        expect(runtime?.db.list()).toEqual([]);
    });

    it('fails what was left unfinished by the previous run', () => {
        const { root, options: given } = options();
        const path = join(root, 'data', 'anime', 'anime.db');
        const previous = new AnimeDb(path);
        const episode = previous.ensureEpisode(previous.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' }).id, '1');
        previous.close();

        const runtime = createAnimeRuntime(given);
        expect(runtime?.db.getEpisode(episode.id)).toMatchObject({ status: 'error', error: { code: 'UNKNOWN' } });
    });

    it('serves the video and the subtitles of a downloaded episode only', () => {
        const runtime = createAnimeRuntime(options().options);
        const db = runtime?.db as AnimeDb;
        const anime = db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' });
        const done = db.ensureEpisode(anime.id, '1');
        const waiting = db.ensureEpisode(anime.id, '2');
        db.markDone(done.id, '/lib/Naruto/Naruto Episode 1.mp4', 10);

        expect(runtime?.media.resolve('episode', done.id)).toBe('/lib/Naruto/Naruto Episode 1.mp4');
        expect(runtime?.media.resolve('subtitle', done.id)).toBe('/lib/Naruto/Naruto Episode 1.vtt');
        expect(runtime?.media.resolve('episode', waiting.id)).toBeNull();
        expect(runtime?.media.resolve('episode', 99)).toBeNull();
    });

    it('does not serve a downloaded episode that has no file recorded', () => {
        const runtime = createAnimeRuntime(options().options);
        const db = runtime?.db as AnimeDb;
        const episode = db.ensureEpisode(db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' }).id, '1');
        db.markFailed(episode.id, 'error', null);
        expect(runtime?.media.resolve('episode', episode.id)).toBeNull();
    });

    it('tells the screen when the library changes', () => {
        const { send, options: given } = options();
        createAnimeRuntime(given)?.handlers.onLibraryChanged();
        expect(send).toHaveBeenCalledWith(IPC.eventAnimeLibrary);
    });

    it('deletes files for the handlers', () => {
        const { root, options: given } = options();
        const runtime = createAnimeRuntime(given);
        const video = join(root, 'a.mp4');
        writeFileSync(video, 'x');
        runtime?.handlers.removeFiles([video, join(root, 'missing.vtt')]);
        expect(existsSync(video)).toBe(false);
    });

    it('has a stream handler that refuses what it was not asked to open, and a stream quality from the settings', async () => {
        const { options: given } = options({ getSettings: () => { return { ...DEFAULT_SETTINGS, animeQuality: '480p' }; } });
        const runtime = createAnimeRuntime(given);
        expect(runtime?.handlers.streamQuality()).toBe('480p');
        expect((await (runtime?.streamHandler as (request: Request) => Promise<Response>)(new Request('pullwave-stream://p/unknown/abc'))).status).toBe(404);

        const stream = runtime?.handlers.streams.create({ url: 'http://127.0.0.1:1/a.m3u8', subtitleUrl: null, referer: null });
        expect(stream?.url).toMatch(/^pullwave-stream:\/\/p\//);
        runtime?.handlers.streams.close(stream?.sessionId ?? '');
        expect((await (runtime?.streamHandler as (request: Request) => Promise<Response>)(new Request(stream?.url ?? ''))).status).toBe(404);
    });

    it('updates ani-cli through the dependencies it was given', async () => {
        const updaterDependencies = {
            fetchText: vi.fn(async (url: string) => {
                return url.includes('/commits/') ? JSON.stringify({ sha: 'b'.repeat(40) }) : '#!/bin/sh\nversion_number="9.0.0"\n';
            }),
            checkSyntax: vi.fn(async () => {
                return true;
            }),
            readText: vi.fn(() => {
                return null;
            }),
            writeFile: vi.fn(),
            replaceFile: vi.fn(),
            removeFile: vi.fn(),
            makeDirectory: vi.fn()
        };
        const { root, options: given } = options({ updaterDependencies });
        const runtime = createAnimeRuntime(given);

        expect(await runtime?.handlers.updateAniCli()).toEqual({ ok: true, output: 'Updated ani-cli unknown → 9.0.0.' });
        expect(updaterDependencies.replaceFile).toHaveBeenCalledWith(join(root, 'data', 'bin', 'ani-cli.tmp'), join(root, 'data', 'bin', 'ani-cli'));
    });

    it('does not update a script that was replaced by another one', async () => {
        const fetchText = vi.fn();
        const { options: given } = options({
            customScriptPath: () => {
                return '/opt/ani-cli';
            },
            updaterDependencies: { fetchText, checkSyntax: vi.fn(), readText: vi.fn(), writeFile: vi.fn(), replaceFile: vi.fn(), removeFile: vi.fn(), makeDirectory: vi.fn() }
        });
        const result = await createAnimeRuntime(given)?.handlers.updateAniCli();
        expect(result?.ok).toBe(false);
        expect(fetchText).not.toHaveBeenCalled();
    });

    it('updates with the real network and shell when none are given (the script is not touched when the answer is bad)', () => {
        const { options: given } = options();
        const runtime = createAnimeRuntime(given);
        expect(typeof runtime?.handlers.updateAniCli).toBe('function');
    });

    it('removes folders and tells where the anime go, for the handlers', () => {
        const { root, options: given } = options();
        const runtime = createAnimeRuntime(given);
        const folder = join(root, 'Downloads', 'Pullwave Anime', 'Naruto');
        mkdirSync(join(folder, 'nested'), { recursive: true });
        writeFileSync(join(folder, 'a.part'), 'x');

        runtime?.handlers.removeFolders([folder]);

        expect(existsSync(folder)).toBe(false);
        expect(runtime?.handlers.baseDirectory()).toBe(join(root, 'Downloads', 'Pullwave Anime'));
    });

    it('uses the anime folder of the settings', () => {
        const { options: given } = options({ getSettings: () => { return { ...DEFAULT_SETTINGS, animeDownloadDir: '/media/anime' }; } });
        expect(createAnimeRuntime(given)?.handlers.baseDirectory()).toBe('/media/anime');
    });

    it('wires the queue to the folders, the screen and ani-cli', async () => {
        const { root, send, options: given } = options();
        mkdirSync(join(root, 'resources', 'bin'), { recursive: true });
        const runtime = createAnimeRuntime(given);

        runtime?.queue.enqueue({ title: 'Naruto', query: 'naruto', index: 1, audio: 'sub', episodes: ['1'] });
        await flush();

        // The folder of the anime was created inside the default one.
        expect(existsSync(join(root, 'Downloads', 'Pullwave Anime', 'Naruto'))).toBe(true);
        const jobs = send.mock.calls
            .filter(([channel]) => {
                return channel === IPC.eventAnimeJob;
            })
            .map(([, job]) => {
                return (job as AnimeJob).status;
            });
        expect(jobs).toEqual(['queued', 'running', 'error']);
        // There is no ani-cli in the empty resources folder, so the download ends with that error.
        expect(runtime?.db.getEpisode(1)).toMatchObject({
            status: 'error',
            error: { code: 'UNKNOWN', raw: 'ani-cli was not found: the copy that ships with the app is missing.' }
        });
        expect(send).toHaveBeenCalledWith(IPC.eventAnimeLibrary);
    });
});
