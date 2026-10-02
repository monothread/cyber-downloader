import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AnimeJob } from '@shared/anime';
import { DEFAULT_SETTINGS, IPC } from '@shared/constants';
import { createAnimeRuntime, REMOVE_RETRY_MS, type AnimeRuntime, type AnimeRuntimeOptions } from '@main/animeRuntime';
import { AnimeDb } from '@main/services/animeDb';
import { BinaryResolver } from '@main/services/binaryResolver';
import { cleanTempDirs, makeTempDir } from '../helpers/tempDir';

// The library keeps its file open (and Windows will not delete an open file): close what a test opened before cleaning up.
const opened: AnimeRuntime[] = [];

function open(given: AnimeRuntimeOptions): AnimeRuntime | null {
    const runtime = createAnimeRuntime(given);
    if (runtime) {
        opened.push(runtime);
    }
    return runtime;
}

afterEach(() => {
    opened.splice(0).forEach((runtime) => {
        runtime.db.close();
    });
    cleanTempDirs();
});

function options(overrides: Partial<AnimeRuntimeOptions> = {}) {
    const root = makeTempDir();
    const send = vi.fn();
    const base: AnimeRuntimeOptions = {
        platform: process.platform,
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
    it('does not exist where the section is not available', () => {
        expect(open(options({ platform: 'darwin' }).options)).toBeNull();
        expect(open(options({ platform: 'freebsd' }).options)).toBeNull();
    });

    it('exists on Linux and on Windows', () => {
        expect(open(options({ platform: 'linux' }).options)).not.toBeNull();
        expect(open(options({ platform: 'win32' }).options)).not.toBeNull();
    });

    it('creates the library under the data folder', () => {
        const { root, options: given } = options();
        const runtime = open(given);
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

        const runtime = open(given);
        expect(runtime?.db.getEpisode(episode.id)).toMatchObject({ status: 'error', error: { code: 'UNKNOWN' } });
    });

    it('serves the video and the subtitles of a downloaded episode only', () => {
        const runtime = open(options().options);
        const db = runtime?.db as AnimeDb;
        const anime = db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' });
        const done = db.ensureEpisode(anime.id, '1');
        const waiting = db.ensureEpisode(anime.id, '2');
        db.markDone(done.id, '/lib/Naruto/Naruto Episode 1.mp4', 10);

        expect(runtime?.media.resolve('episode', done.id, '')).toBe('/lib/Naruto/Naruto Episode 1.mp4');
        expect(runtime?.media.resolve('subtitle', done.id, '')).toBe('/lib/Naruto/Naruto Episode 1.vtt');
        expect(runtime?.media.resolve('episode', waiting.id, '')).toBeNull();
        expect(runtime?.media.resolve('episode', 99, '')).toBeNull();
    });

    describe('subtitles', () => {
        function downloaded(extraFiles: Record<string, string> = {}) {
            const { root, options: given } = options();
            const folder = join(root, 'lib', 'Naruto');
            mkdirSync(folder, { recursive: true });
            const video = join(folder, 'Naruto Episode 1.mp4');
            writeFileSync(video, 'v');
            Object.entries(extraFiles).forEach(([name, text]) => {
                writeFileSync(join(folder, name), text);
            });
            return { root, folder, video, given };
        }

        function addEpisode(runtime: AnimeRuntime | null, video: string, number = '1') {
            const db = runtime?.db as AnimeDb;
            const anime = db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' });
            const episode = db.ensureEpisode(anime.id, number);
            db.markDone(episode.id, video, 1);
            return episode;
        }

        it('serves the subtitle of the episode that was asked for, and no file outside of them', () => {
            const { folder, video, given } = downloaded({ 'Naruto Episode 1.vtt': 'a', 'Naruto Episode 1.subtitle-Japanese.vtt': 'ja' });
            const runtime = open(given);
            const episode = addEpisode(runtime, video);
            expect(runtime?.media.resolve('subtitle', episode.id, '')).toBe(join(folder, 'Naruto Episode 1.vtt'));
            expect(runtime?.media.resolve('subtitle', episode.id, 'subtitle-Japanese')).toBe(join(folder, 'Naruto Episode 1.subtitle-Japanese.vtt'));
            expect(runtime?.media.resolve('subtitle', episode.id, 'subtitle-Korean')).toBeNull();
            expect(runtime?.media.resolve('subtitle', episode.id, '../Naruto Episode 1')).toBeNull();
            expect(runtime?.media.resolve('episode', episode.id, 'subtitle-Japanese')).toBe(video);
        });

        it('lists the subtitles of a downloaded episode', () => {
            const { video, given } = downloaded({ 'Naruto Episode 1.vtt': 'a', 'Naruto Episode 1.subtitle-Japanese.vtt': 'ja' });
            const runtime = open(given);
            const episode = addEpisode(runtime, video);
            expect(runtime?.handlers.subtitles.list(episode.id)).toEqual([
                { id: '', label: 'Default', kind: 'default' },
                { id: 'subtitle-Japanese', label: 'Japanese', kind: 'source' }
            ]);
        });

        it('lists nothing for an episode that is not downloaded or does not exist', () => {
            const { given } = downloaded();
            const runtime = open(given);
            const db = runtime?.db as AnimeDb;
            const waiting = db.ensureEpisode(db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' }).id, '2');
            expect(runtime?.handlers.subtitles.list(waiting.id)).toEqual([]);
            expect(runtime?.handlers.subtitles.list(99)).toEqual([]);
        });

        it('loads the file the user chooses next to the video', async () => {
            const { root, folder, video, given } = downloaded();
            const source = join(root, 'ja.srt');
            writeFileSync(source, '1\n00:00:01,000 --> 00:00:02,000\nHi\n');
            const chooseSubtitleFile = vi.fn(async () => {
                return source;
            });
            const runtime = open({ ...given, chooseSubtitleFile });
            const episode = addEpisode(runtime, video);

            expect(await runtime?.handlers.subtitles.import(episode.id)).toEqual({
                ok: true,
                tracks: [{ id: 'import-ja', label: 'ja', kind: 'imported' }],
                imported: { id: 'import-ja', label: 'ja', kind: 'imported' }
            });
            expect(chooseSubtitleFile).toHaveBeenCalledTimes(1);
            expect(readFileSync(join(folder, 'Naruto Episode 1.import-ja.vtt'), 'utf-8')).toBe('WEBVTT\n\n1\n00:00:01.000 --> 00:00:02.000\nHi\n');
        });

        it('does not load anything when no file picker is given, and for an episode that is not downloaded', async () => {
            const { folder, video, given } = downloaded();
            const runtime = open(given);
            const episode = addEpisode(runtime, video);
            expect(await runtime?.handlers.subtitles.import(episode.id)).toEqual({ ok: false, reason: 'cancelled' });
            expect(await runtime?.handlers.subtitles.import(99)).toEqual({ ok: false, reason: 'missing' });
            expect(existsSync(join(folder, 'Naruto Episode 1.import-ja.vtt'))).toBe(false);
        });
    });

    it('does not serve a downloaded episode that has no file recorded', () => {
        const runtime = open(options().options);
        const db = runtime?.db as AnimeDb;
        const episode = db.ensureEpisode(db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' }).id, '1');
        db.markFailed(episode.id, 'error', null);
        expect(runtime?.media.resolve('episode', episode.id, '')).toBeNull();
    });

    it('tells the screen when the library changes', () => {
        const { send, options: given } = options();
        open(given)?.handlers.onLibraryChanged();
        expect(send).toHaveBeenCalledWith(IPC.eventAnimeLibrary);
    });

    it('deletes files for the handlers', () => {
        const { root, options: given } = options();
        const runtime = open(given);
        const video = join(root, 'a.mp4');
        writeFileSync(video, 'x');
        runtime?.handlers.removeFiles([video, join(root, 'missing.vtt')]);
        expect(existsSync(video)).toBe(false);
    });

    it('has a stream handler that refuses what it was not asked to open, and a stream quality from the settings', async () => {
        const { options: given } = options({ getSettings: () => { return { ...DEFAULT_SETTINGS, animeQuality: '480p' }; } });
        const runtime = open(given);
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
        const runtime = open(given);

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
        const result = await open(given)?.handlers.updateAniCli();
        expect(result?.ok).toBe(false);
        expect(fetchText).not.toHaveBeenCalled();
    });

    it('updates with the real network and shell when none are given (the script is not touched when the answer is bad)', () => {
        const { options: given } = options();
        const runtime = open(given);
        expect(typeof runtime?.handlers.updateAniCli).toBe('function');
    });

    it('removes folders and tells where the anime go, for the handlers', () => {
        const { root, options: given } = options();
        const runtime = open(given);
        const folder = join(root, 'Downloads', 'Pullwave Anime', 'Naruto');
        mkdirSync(join(folder, 'nested'), { recursive: true });
        writeFileSync(join(folder, 'a.part'), 'x');

        runtime?.handlers.removeFolders([folder]);

        expect(existsSync(folder)).toBe(false);
        expect(runtime?.handlers.baseDirectory()).toBe(join(root, 'Downloads', 'Pullwave Anime'));
    });

    it('removes the folder of an episode for the handlers only when it is empty', () => {
        const { root, options: given } = options();
        const runtime = open(given);
        const empty = join(root, 'Naruto', 'Episode 1');
        const full = join(root, 'Naruto', 'Episode 2');
        mkdirSync(empty, { recursive: true });
        mkdirSync(full, { recursive: true });
        writeFileSync(join(full, 'a.vtt'), 'x');

        runtime?.handlers.removeEmptyFolders([empty, full, join(root, 'Naruto', 'Episode 3')]);

        expect(existsSync(empty)).toBe(false);
        expect(existsSync(join(full, 'a.vtt'))).toBe(true);
    });

    it('opens folders through the function it was given, and does nothing without one', () => {
        const openFolder = vi.fn();
        open({ ...options().options, openFolder })?.handlers.openFolder('/lib/Naruto');
        expect(openFolder).toHaveBeenCalledTimes(1);
        expect(openFolder).toHaveBeenCalledWith('/lib/Naruto');
        expect(() => {
            open(options().options)?.handlers.openFolder('/lib/Naruto');
        }).not.toThrow();
    });

    describe('importing a folder of anime', () => {
        function folderOfAnime(root: string): string {
            const folder = join(root, 'backup');
            mkdirSync(join(folder, 'Naruto', 'Episode 1'), { recursive: true });
            mkdirSync(join(folder, 'Naruto', 'Episode 2'), { recursive: true });
            writeFileSync(join(folder, 'Naruto', 'Episode 1', 'Naruto Episode 1.mp4'), 'abc');
            writeFileSync(join(folder, 'Naruto', 'Episode 2', 'Naruto Episode 2.mp4'), 'abcdef');
            writeFileSync(
                join(folder, 'Naruto', 'Episode 2', 'pullwave.json'),
                JSON.stringify({ version: 1, title: 'Naruto', query: 'naruto', searchIndex: 2, audio: 'dub', number: '2', positionSeconds: 50, durationSeconds: 100, watched: true })
            );
            return folder;
        }

        it('adds what is in the folder the user chose, starting at the folder of the anime', async () => {
            const { root, options: given } = options();
            const folder = folderOfAnime(root);
            const chooseLibraryFolder = vi.fn(async () => {
                return folder;
            });
            const runtime = open({ ...given, chooseLibraryFolder });

            expect(await runtime?.handlers.importLibrary()).toEqual({ ok: true, added: 2, relinked: 0, skipped: 0, ignored: 0 });
            expect(chooseLibraryFolder).toHaveBeenCalledTimes(1);
            expect(chooseLibraryFolder).toHaveBeenCalledWith(join(root, 'Downloads', 'Pullwave Anime'));
            const list = runtime?.db.list() ?? [];
            expect(
                list.map((anime) => {
                    return [anime.title, anime.audio, anime.searchIndex];
                })
            ).toEqual([
                ['Naruto', 'dub', 2],
                ['Naruto', 'sub', 0]
            ]);
            expect(list[0]?.episodes[0]).toMatchObject({ number: '2', status: 'done', sizeBytes: 6, positionSeconds: 50, watched: true });
        });

        it('uses the audio of the settings for what does not say it', async () => {
            const { root, options: given } = options({ getSettings: () => { return { ...DEFAULT_SETTINGS, animeAudio: 'dub' }; } });
            const folder = folderOfAnime(root);
            const runtime = open({ ...given, chooseLibraryFolder: async () => { return folder; } });
            await runtime?.handlers.importLibrary();
            expect(
                runtime?.db.list().map((anime) => {
                    return [anime.title, anime.audio];
                })
            ).toEqual([['Naruto', 'dub']]);
        });

        it('writes the metadata of what it added, so the next time they are known exactly', async () => {
            const { root, options: given } = options();
            const folder = folderOfAnime(root);
            const runtime = open({ ...given, chooseLibraryFolder: async () => { return folder; } });
            await runtime?.handlers.importLibrary();
            expect(JSON.parse(readFileSync(join(folder, 'Naruto', 'Episode 1', 'pullwave.json'), 'utf-8'))).toEqual({
                version: 1,
                title: 'Naruto',
                query: 'Naruto',
                searchIndex: 0,
                audio: 'sub',
                number: '1',
                positionSeconds: 0,
                durationSeconds: 0,
                watched: false
            });
        });

        it('does nothing when the user gives up or there is no way to ask', async () => {
            const { root, options: given } = options();
            folderOfAnime(root);
            const cancelled = open({ ...given, chooseLibraryFolder: async () => { return null; } });
            expect(await cancelled?.handlers.importLibrary()).toEqual({ ok: false, reason: 'cancelled' });
            expect(cancelled?.db.list()).toEqual([]);
            expect(await open(options().options)?.handlers.importLibrary()).toEqual({ ok: false, reason: 'cancelled' });
        });

        it('says which episodes have lost their file and refreshes the metadata when the progress is saved', () => {
            const { root, options: given } = options();
            const runtime = open(given);
            const folder = join(root, 'Naruto', 'Episode 1');
            mkdirSync(folder, { recursive: true });
            const video = join(folder, 'Naruto Episode 1.mp4');
            writeFileSync(video, 'x');
            const anime = (runtime?.db as AnimeDb).upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' });
            const episode = (runtime?.db as AnimeDb).ensureEpisode(anime.id, '1');
            (runtime?.db as AnimeDb).markDone(episode.id, video, 1);

            expect(runtime?.handlers.fileExists(video)).toBe(true);
            expect(runtime?.handlers.fileExists(join(folder, 'gone.mp4'))).toBe(false);
            runtime?.handlers.refreshMetadata(episode.id);
            expect(JSON.parse(readFileSync(join(folder, 'pullwave.json'), 'utf-8'))).toMatchObject({ title: 'Naruto', searchIndex: 1, number: '1' });
        });
    });

    it('uses the anime folder of the settings', () => {
        const { options: given } = options({ getSettings: () => { return { ...DEFAULT_SETTINGS, animeDownloadDir: '/media/anime' }; } });
        expect(open(given)?.handlers.baseDirectory()).toBe('/media/anime');
    });

    describe('removing again what could not be removed at once', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('tries again for what is still there after a moment, but not before', () => {
            vi.useFakeTimers();
            const { root, options: given } = options({ removeRetryMs: 500 });
            const video = join(root, 'a.mp4');
            writeFileSync(video, 'x');
            const files = vi.fn();
            const runtime = open({ ...given, remover: { files, folders: vi.fn() } });

            runtime?.handlers.removeFiles([video, join(root, 'gone.vtt')]);
            expect(files.mock.calls).toEqual([[[video, join(root, 'gone.vtt')]]]);
            vi.advanceTimersByTime(499);
            expect(files).toHaveBeenCalledTimes(1);
            vi.advanceTimersByTime(1);
            expect(files.mock.calls[1]).toEqual([[video]]);
        });

        it('does not try again when everything is gone', () => {
            vi.useFakeTimers();
            const { root, options: given } = options({ removeRetryMs: 500 });
            const files = vi.fn();
            open({ ...given, remover: { files, folders: vi.fn() } })?.handlers.removeFiles([join(root, 'gone.mp4')]);
            vi.advanceTimersByTime(1000);
            expect(files).toHaveBeenCalledTimes(1);
        });

        it('does the same for folders', () => {
            vi.useFakeTimers();
            const { root, options: given } = options({ removeRetryMs: 100 });
            const folder = join(root, 'Naruto');
            mkdirSync(folder);
            const folders = vi.fn();
            open({ ...given, remover: { files: vi.fn(), folders } })?.handlers.removeFolders([folder]);
            vi.advanceTimersByTime(100);
            expect(folders.mock.calls).toEqual([[[folder]], [[folder]]]);
        });

        it('does the same for the folders of the episodes', () => {
            vi.useFakeTimers();
            const { root, options: given } = options({ removeRetryMs: 100 });
            const folder = join(root, 'Naruto', 'Episode 1');
            mkdirSync(folder, { recursive: true });
            const emptyFolders = vi.fn();
            open({ ...given, remover: { files: vi.fn(), folders: vi.fn(), emptyFolders } })?.handlers.removeEmptyFolders([folder]);
            vi.advanceTimersByTime(100);
            expect(emptyFolders.mock.calls).toEqual([[[folder]], [[folder]]]);
        });

        it('waits 500 ms by default', () => {
            vi.useFakeTimers();
            const { root, options: given } = options();
            const video = join(root, 'a.mp4');
            writeFileSync(video, 'x');
            const files = vi.fn();
            open({ ...given, remover: { files, folders: vi.fn() } })?.handlers.removeFiles([video]);
            vi.advanceTimersByTime(REMOVE_RETRY_MS - 1);
            expect(files).toHaveBeenCalledTimes(1);
            vi.advanceTimersByTime(1);
            expect(files).toHaveBeenCalledTimes(2);
        });

        it('really removes with the default removers', () => {
            const { root, options: given } = options({ removeRetryMs: 10 });
            const video = join(root, 'a.mp4');
            writeFileSync(video, 'x');
            open(given)?.handlers.removeFiles([video]);
            expect(existsSync(video)).toBe(false);
        });
    });

    it('wires the queue to the folders, the screen and ani-cli', async () => {
        const { root, send, options: given } = options();
        mkdirSync(join(root, 'resources', 'bin'), { recursive: true });
        const runtime = open(given);

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
