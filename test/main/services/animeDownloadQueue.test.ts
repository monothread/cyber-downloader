import { join } from 'node:path';
import type { AniDownloadProgress, AniRunResult, AnimeDownloadRequest, AnimeJob } from '@shared/anime';
import { DEFAULT_SETTINGS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { AnimeDb } from '@main/services/animeDb';
import { AnimeDownloadQueue } from '@main/services/animeDownloadQueue';
import { DEFAULT_ANIME_FOLDER } from '@main/services/animeFiles';
import type { AniDownloadHandle, AniDownloadOptions } from '@main/services/aniCliService';

type DownloadResult = AniRunResult<{ filePath: string | null }>;

interface Download {
    options: AniDownloadOptions;
    cancel: ReturnType<typeof vi.fn>;
    finish: (result: DownloadResult) => void;
}

const DOWNLOADS = '/home/me/Downloads';
const REQUEST: AnimeDownloadRequest = { title: 'Naruto', query: 'naruto', index: 2, audio: 'sub', episodes: ['1', '2', '3'] };

function setup(
    settings: Partial<Settings> = {},
    files: Record<string, number> = {},
    system: { platform?: NodeJS.Platform; downloads?: string; directories?: string[] } = {}
) {
    const db = new AnimeDb(':memory:', () => {
        return 1000;
    });
    const downloads: Download[] = [];
    const updates: AnimeJob[] = [];
    const state = { settings: { ...DEFAULT_SETTINGS, ...settings }, libraryChanges: 0, directories: [] as string[], files: { ...files }, downloaded: [] as number[] };
    const ensureDirectory = vi.fn((path: string) => {
        state.directories.push(path);
    });
    const queue = new AnimeDownloadQueue({
        db,
        download: (options): AniDownloadHandle => {
            let finish: (result: DownloadResult) => void = () => {
                return undefined;
            };
            const result = new Promise<DownloadResult>((resolve) => {
                finish = resolve;
            });
            const cancel = vi.fn();
            downloads.push({ options, cancel, finish });
            return { result, cancel };
        },
        getSettings: () => {
            return state.settings;
        },
        defaultDownloadDir: system.downloads ?? DOWNLOADS,
        platform: system.platform,
        ensureDirectory,
        fileSize: (path) => {
            return state.files[path] ?? null;
        },
        directoryExists: (path) => {
            return (system.directories ?? []).includes(path);
        },
        onEpisodeDownloaded: (episodeId) => {
            state.downloaded.push(episodeId);
        },
        onJobUpdate: (job) => {
            updates.push(job);
        },
        onLibraryChanged: () => {
            state.libraryChanges += 1;
        }
    });
    return { db, queue, downloads, updates, state, ensureDirectory };
}

async function settleResults(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function doneAt(path: string | null): DownloadResult {
    return { status: 'done', value: { filePath: path } };
}

describe('AnimeDownloadQueue.enqueue', () => {
    it('adds the anime and its episodes to the library and queues a job for each', () => {
        const { queue, db, updates, state } = setup();
        const anime = queue.enqueue(REQUEST);

        expect(anime).toMatchObject({ title: 'Naruto', query: 'naruto', searchIndex: 2, audio: 'sub' });
        expect(
            anime?.episodes.map((episode) => {
                return [episode.number, episode.status];
            })
        ).toEqual([
            ['1', 'downloading'],
            ['2', 'downloading'],
            ['3', 'queued']
        ]);
        expect(db.list()).toHaveLength(1);
        expect(updates[0]).toEqual({
            episodeId: 1,
            animeId: 1,
            animeTitle: 'Naruto',
            episode: '1',
            status: 'queued',
            percent: 0,
            speed: '',
            eta: '',
            error: null
        });
        expect(state.libraryChanges).toBeGreaterThan(0);
    });

    it('starts as many downloads as the setting allows, in the order of the episodes', () => {
        const { queue, downloads, ensureDirectory } = setup({ maxConcurrent: 2 });
        queue.enqueue(REQUEST);

        expect(downloads).toHaveLength(2);
        expect(downloads[0]?.options).toMatchObject({
            query: 'naruto',
            index: 2,
            episode: '1',
            quality: 'best',
            audio: 'sub',
            downloadDir: join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Naruto', 'Episode 1')
        });
        expect(downloads[1]?.options.episode).toBe('2');
        expect(downloads[1]?.options.downloadDir).toBe(join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Naruto', 'Episode 2'));
        expect(ensureDirectory).toHaveBeenCalledTimes(2);
        expect(ensureDirectory).toHaveBeenNthCalledWith(1, join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Naruto', 'Episode 1'));
        expect(ensureDirectory).toHaveBeenNthCalledWith(2, join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Naruto', 'Episode 2'));
        expect(
            queue.list().map((job) => {
                return job.status;
            })
        ).toEqual(['running', 'running', 'queued']);
        expect(queue.pendingCount()).toBe(3);
    });

    it('uses the folder, the quality and the audio chosen', () => {
        const { queue, downloads } = setup({ animeDownloadDir: '/media/anime', animeQuality: '720p' });
        queue.enqueue({ ...REQUEST, audio: 'dub', episodes: ['1'] });
        expect(downloads[0]?.options).toMatchObject({ quality: '720p', audio: 'dub', downloadDir: join('/media/anime', 'Naruto', 'Episode 1') });
    });

    it('names the folder after the anime without forbidden characters', () => {
        const { queue, downloads } = setup();
        queue.enqueue({ ...REQUEST, title: 'Re:Zero / Season 2', episodes: ['1'] });
        expect(downloads[0]?.options.downloadDir).toBe(join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Re_Zero _ Season 2', 'Episode 1'));
    });

    it('leaves downloaded episodes and episodes already waiting alone', async () => {
        const { queue, downloads, state } = setup({ maxConcurrent: 1 }, { '/a/1.mp4': 10 });
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        downloads[0]?.finish(doneAt('/a/1.mp4'));
        await settleResults();

        queue.enqueue({ ...REQUEST, episodes: ['1', '2'] });
        queue.enqueue({ ...REQUEST, episodes: ['2'] });

        expect(downloads.map((download) => {
            return download.options.episode;
        })).toEqual(['1', '2']);
        expect(state.libraryChanges).toBeGreaterThan(0);
    });

    it('queues an episode that failed before again', async () => {
        const { queue, downloads } = setup({ maxConcurrent: 1 });
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        downloads[0]?.finish({ status: 'error', error: { code: 'NETWORK', raw: 'down' } });
        await settleResults();

        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        expect(downloads).toHaveLength(2);
        expect(queue.list()).toHaveLength(1);
        expect(queue.list()[0]).toMatchObject({ status: 'running', error: null });
    });
});

describe('AnimeDownloadQueue on Windows', () => {
    const WINDOWS_DOWNLOADS = 'C:\\Users\\me\\Downloads';

    it('saves in a folder named after the anime with Windows rules, inside Downloads', () => {
        const { queue, downloads, ensureDirectory } = setup({}, {}, { platform: 'win32', downloads: WINDOWS_DOWNLOADS });
        queue.enqueue({ ...REQUEST, title: 'NUL', episodes: ['1'] });
        const folder = 'C:\\Users\\me\\Downloads\\Pullwave Anime\\_NUL\\Episode 1';
        expect(downloads[0]?.options.downloadDir).toBe(folder);
        expect(ensureDirectory).toHaveBeenCalledWith(folder);
    });

    it('uses the folder of the settings', () => {
        const { queue, downloads } = setup({ animeDownloadDir: 'D:\\Anime' }, {}, { platform: 'win32', downloads: WINDOWS_DOWNLOADS });
        queue.enqueue({ ...REQUEST, title: 'Re:Zero', episodes: ['1'] });
        expect(downloads[0]?.options.downloadDir).toBe('D:\\Anime\\Re_Zero\\Episode 1');
    });

    it('looks for the file in that folder when yt-dlp did not say where it wrote', async () => {
        const path = 'D:\\Anime\\Re_Zero\\Episode 1\\Re_Zero Episode 1.mp4';
        const { queue, db, downloads } = setup({ animeDownloadDir: 'D:\\Anime' }, { [path]: 10 }, { platform: 'win32', downloads: WINDOWS_DOWNLOADS });
        queue.enqueue({ ...REQUEST, title: 'Re:Zero', episodes: ['1'] });
        downloads[0]?.finish(doneAt(null));
        await settleResults();
        expect(db.getEpisode(1)).toMatchObject({ status: 'done', filePath: path });
    });

    it('keeps the path of a long title inside the limit of Windows', () => {
        const base = `C:\\${'a'.repeat(120)}`;
        const { queue, downloads } = setup({ animeDownloadDir: base }, {}, { platform: 'win32', downloads: WINDOWS_DOWNLOADS });
        const title = 'T'.repeat(60);
        queue.enqueue({ ...REQUEST, title, episodes: ['1'] });
        const folder = downloads[0]?.options.downloadDir ?? '';
        expect(folder.endsWith('\\Episode 1')).toBe(true);
        expect(`${folder.replace('Episode 1', 'Episode 999')}\\${title} Episode 999.mp4`.length).toBeLessThanOrEqual(240);
    });
});

describe('AnimeDownloadQueue progress', () => {
    it('reports the percent, the speed and the time left', () => {
        const { queue, downloads, updates } = setup();
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        const progress: AniDownloadProgress = { percent: 12.5, totalBytes: 100, speed: '1.00MiB/s', eta: '00:30' };
        downloads[0]?.options.onProgress?.(progress);
        expect(updates.at(-1)).toMatchObject({ status: 'running', percent: 12.5, speed: '1.00MiB/s', eta: '00:30' });
    });

    it('shows empty text when ani-cli gave no speed or time left', () => {
        const { queue, downloads, updates } = setup();
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        downloads[0]?.options.onProgress?.({ percent: 5, totalBytes: null, speed: null, eta: null });
        expect(updates.at(-1)).toMatchObject({ percent: 5, speed: '', eta: '' });
    });

    it('does not report a change smaller than half a percent, but always the end', () => {
        const { queue, downloads, updates } = setup();
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        const report = (percent: number): void => {
            downloads[0]?.options.onProgress?.({ percent, totalBytes: null, speed: null, eta: null });
        };
        const before = updates.length;
        report(0.2);
        report(1);
        report(1.2);
        report(1.6);
        report(99.9);
        report(100);
        report(100);

        expect(
            updates.slice(before).map((job) => {
                return job.percent;
            })
        ).toEqual([1, 1.6, 99.9, 100, 100]);
    });
});

describe('AnimeDownloadQueue results', () => {
    it('stores the file and size of a finished episode and starts the next one', async () => {
        const { queue, db, downloads, updates, state } = setup({ maxConcurrent: 1 }, { '/a/Naruto Episode 1.mp4': 4096 });
        queue.enqueue({ ...REQUEST, episodes: ['1', '2'] });
        const changesBefore = state.libraryChanges;
        downloads[0]?.finish(doneAt('/a/Naruto Episode 1.mp4'));
        await settleResults();

        expect(db.getEpisode(1)).toMatchObject({ status: 'done', filePath: '/a/Naruto Episode 1.mp4', sizeBytes: 4096, downloadedAt: 1000 });
        expect(updates.filter((job) => {
            return job.episodeId === 1;
        }).at(-1)).toMatchObject({ status: 'done', percent: 100, speed: '', eta: '' });
        expect(downloads).toHaveLength(2);
        expect(downloads[1]?.options.episode).toBe('2');
        expect(state.libraryChanges).toBeGreaterThan(changesBefore);
    });

    it('looks for the file where ani-cli names it when yt-dlp did not say where it wrote', async () => {
        const path = join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Re_Zero', 'Episode 1', 'Re_Zero Episode 1.mp4');
        const { queue, db, downloads } = setup({}, { [path]: 10 });
        queue.enqueue({ ...REQUEST, title: 'Re:Zero', episodes: ['1'] });
        downloads[0]?.finish(doneAt(null));
        await settleResults();
        expect(db.getEpisode(1)).toMatchObject({ status: 'done', filePath: path, sizeBytes: 10 });
    });

    it('fails an episode whose file is not there', async () => {
        const { queue, db, downloads, updates } = setup();
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        downloads[0]?.finish(doneAt('/a/missing.mp4'));
        await settleResults();

        const error = { code: 'UNKNOWN', raw: 'The downloaded file was not found: /a/missing.mp4' };
        expect(db.getEpisode(1)).toMatchObject({ status: 'error', error });
        expect(updates.at(-1)).toMatchObject({ status: 'error', error });
    });

    it('records the error of a failed download and moves on', async () => {
        const { queue, db, downloads, updates } = setup({ maxConcurrent: 1 });
        queue.enqueue({ ...REQUEST, episodes: ['1', '2'] });
        const error = { code: 'NO_SOURCES' as const, raw: 'No sources found for sub!' };
        downloads[0]?.finish({ status: 'error', error });
        await settleResults();

        expect(db.getEpisode(1)).toMatchObject({ status: 'error', error });
        expect(updates.filter((job) => {
            return job.episodeId === 1;
        }).at(-1)).toMatchObject({ status: 'error', error, speed: '', eta: '' });
        expect(downloads).toHaveLength(2);
    });

    it('records a cancelled download', async () => {
        const { queue, db, downloads, updates } = setup();
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        downloads[0]?.finish({ status: 'cancelled' });
        await settleResults();

        expect(db.getEpisode(1)).toMatchObject({ status: 'cancelled', error: null });
        expect(updates.at(-1)).toMatchObject({ status: 'cancelled' });
    });

    it('fails the job when the folder cannot be created and uses the slot for the next one', async () => {
        const { queue, db, downloads, ensureDirectory, updates } = setup({ maxConcurrent: 1 });
        ensureDirectory.mockImplementationOnce(() => {
            throw new Error('EACCES: permission denied');
        });
        queue.enqueue({ ...REQUEST, episodes: ['1', '2'] });

        const error = { code: 'UNKNOWN', raw: 'EACCES: permission denied' };
        expect(db.getEpisode(1)).toMatchObject({ status: 'error', error });
        expect(updates.find((job) => {
            return job.status === 'error';
        })).toMatchObject({ episodeId: 1, error });
        expect(downloads).toHaveLength(1);
        expect(downloads[0]?.options.episode).toBe('2');
    });

    it('describes a folder failure that is not an Error', () => {
        const { queue, db, ensureDirectory } = setup({ maxConcurrent: 1 });
        ensureDirectory.mockImplementationOnce(() => {
            throw 'disk full';
        });
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        expect(db.getEpisode(1)?.error).toEqual({ code: 'UNKNOWN', raw: 'disk full' });
    });

    it('drops a job whose anime is gone before it starts', () => {
        const { queue, db, downloads, state } = setup({ maxConcurrent: 0 });
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        db.removeAnime(1);
        state.settings = { ...state.settings, maxConcurrent: 1 };

        queue.forget([]);

        expect(queue.list()).toEqual([]);
        expect(downloads).toEqual([]);
    });
});

describe('AnimeDownloadQueue.cancel', () => {
    it('asks a running download to stop and lets its result settle the job', async () => {
        const { queue, downloads, db } = setup({ maxConcurrent: 1 });
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        queue.cancel(1);
        expect(downloads[0]?.cancel).toHaveBeenCalledTimes(1);
        expect(queue.list()[0]?.status).toBe('running');

        downloads[0]?.finish({ status: 'cancelled' });
        await settleResults();
        expect(queue.list()[0]?.status).toBe('cancelled');
        expect(db.getEpisode(1)?.status).toBe('cancelled');
    });

    it('cancels a waiting job on the spot', () => {
        const { queue, downloads, db, updates, state } = setup({ maxConcurrent: 1 });
        queue.enqueue({ ...REQUEST, episodes: ['1', '2'] });
        const changesBefore = state.libraryChanges;
        queue.cancel(2);

        expect(db.getEpisode(2)).toMatchObject({ status: 'cancelled', error: null });
        expect(updates.at(-1)).toMatchObject({ episodeId: 2, status: 'cancelled' });
        expect(downloads).toHaveLength(1);
        expect(state.libraryChanges).toBe(changesBefore + 1);
    });

    it('ignores a job that is unknown or already over', async () => {
        const { queue, downloads, updates } = setup({ maxConcurrent: 1 }, { '/a/1.mp4': 1 });
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        downloads[0]?.finish(doneAt('/a/1.mp4'));
        await settleResults();
        const count = updates.length;

        queue.cancel(1);
        queue.cancel(99);

        expect(updates).toHaveLength(count);
        expect(downloads[0]?.cancel).not.toHaveBeenCalled();
    });
});

describe('AnimeDownloadQueue.retry', () => {
    it('queues an episode that failed again', async () => {
        const { queue, downloads, db } = setup({ maxConcurrent: 1 });
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        downloads[0]?.finish({ status: 'error', error: { code: 'BLOCKED', raw: 'Blocked by cloudflare.' } });
        await settleResults();

        queue.retry(1);

        expect(downloads).toHaveLength(2);
        expect(downloads[1]?.options.episode).toBe('1');
        expect(db.getEpisode(1)).toMatchObject({ status: 'downloading', error: null });
    });

    it('also works for an episode left unfinished by an earlier run of the app', () => {
        const { queue, downloads, db } = setup();
        const anime = db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'dub' });
        const episode = db.ensureEpisode(anime.id, '7');
        db.failInterrupted();

        queue.retry(episode.id);

        expect(downloads).toHaveLength(1);
        expect(downloads[0]?.options).toMatchObject({ query: 'naruto', index: 1, episode: '7', audio: 'dub' });
    });

    it('does nothing for an episode that is downloaded, already active or does not exist', async () => {
        const { queue, downloads } = setup({ maxConcurrent: 1 }, { '/a/1.mp4': 1 });
        queue.enqueue({ ...REQUEST, episodes: ['1', '2'] });
        downloads[0]?.finish(doneAt('/a/1.mp4'));
        await settleResults();
        const started = downloads.length;

        queue.retry(1);
        queue.retry(2);
        queue.retry(99);

        expect(downloads).toHaveLength(started);
    });
});

describe('AnimeDownloadQueue.clearFinished', () => {
    it('removes the jobs that are over and keeps the ones that are not', async () => {
        const { queue, downloads } = setup({ maxConcurrent: 1 }, { '/a/1.mp4': 1 });
        queue.enqueue({ ...REQUEST, episodes: ['1', '2', '3'] });
        downloads[0]?.finish(doneAt('/a/1.mp4'));
        await settleResults();
        queue.cancel(3);

        queue.clearFinished();

        expect(
            queue.list().map((job) => {
                return [job.episode, job.status];
            })
        ).toEqual([['2', 'running']]);
    });
});

describe('AnimeDownloadQueue.forget', () => {
    it('stops what is running for the episodes, drops their jobs and ignores their result', async () => {
        const { queue, downloads, db } = setup({ maxConcurrent: 1 });
        queue.enqueue({ ...REQUEST, episodes: ['1', '2'] });
        db.removeEpisode(1);

        queue.forget([1]);

        expect(downloads[0]?.cancel).toHaveBeenCalledTimes(1);
        expect(
            queue.list().map((job) => {
                return job.episode;
            })
        ).toEqual(['2']);
        expect(downloads).toHaveLength(2);

        downloads[0]?.finish({ status: 'cancelled' });
        await settleResults();
        expect(queue.list()).toHaveLength(1);
    });

    it('is harmless for an episode without a job', () => {
        const { queue } = setup();
        expect(() => {
            queue.forget([5]);
        }).not.toThrow();
    });
});

describe('AnimeDownloadQueue.shutdown', () => {
    it('cancels every running download', () => {
        const { queue, downloads } = setup({ maxConcurrent: 2 });
        queue.enqueue(REQUEST);
        queue.shutdown();
        expect(downloads[0]?.cancel).toHaveBeenCalledTimes(1);
        expect(downloads[1]?.cancel).toHaveBeenCalledTimes(1);
    });

    it('does nothing when nothing runs', () => {
        const { queue } = setup();
        expect(() => {
            queue.shutdown();
        }).not.toThrow();
        expect(queue.pendingCount()).toBe(0);
    });
});

describe('AnimeDownloadQueue folders and metadata', () => {
    const ANIME_FOLDER = join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Naruto');

    function withDownloaded(videoPath: string, directories: string[]) {
        const context = setup({}, {}, { directories });
        const anime = context.db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 2, audio: 'sub' });
        context.db.markDone(context.db.ensureEpisode(anime.id, '1').id, videoPath, 10);
        return { ...context, anime };
    }

    it('tells that an episode was downloaded once it is in the library, and not before', async () => {
        const { queue, downloads, state } = setup({ maxConcurrent: 1 }, { '/a/Naruto Episode 1.mp4': 4096 });
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        expect(state.downloaded).toEqual([]);
        downloads[0]?.finish(doneAt('/a/Naruto Episode 1.mp4'));
        await settleResults();
        expect(state.downloaded).toEqual([1]);
    });

    it('does not tell it for an episode that failed because its file is not there', async () => {
        const { queue, downloads, state } = setup({ maxConcurrent: 1 });
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        downloads[0]?.finish(doneAt('/a/missing.mp4'));
        await settleResults();
        expect(state.downloaded).toEqual([]);
    });

    it('puts a new episode with the others when the folder of the anime was renamed or moved', () => {
        const renamed = join('/media', 'My Naruto');
        const { queue, downloads, ensureDirectory } = withDownloaded(join(renamed, 'Episode 1', 'Naruto Episode 1.mp4'), [renamed]);
        queue.enqueue({ ...REQUEST, episodes: ['2'] });
        expect(downloads[0]?.options.downloadDir).toBe(join(renamed, 'Episode 2'));
        expect(ensureDirectory).toHaveBeenCalledWith(join(renamed, 'Episode 2'));
    });

    it('goes back to the folder named after the anime when the one it had is gone', () => {
        const { queue, downloads } = withDownloaded(join('/media', 'My Naruto', 'Episode 1', 'Naruto Episode 1.mp4'), []);
        queue.enqueue({ ...REQUEST, episodes: ['2'] });
        expect(downloads[0]?.options.downloadDir).toBe(join(ANIME_FOLDER, 'Episode 2'));
    });

    it('does not take the folder of a video that is not in the folder of an episode for the folder of the anime', () => {
        const { queue, downloads } = withDownloaded(join('/media', 'Videos', 'Naruto Episode 1.mp4'), [join('/media', 'Videos')]);
        queue.enqueue({ ...REQUEST, episodes: ['2'] });
        expect(downloads[0]?.options.downloadDir).toBe(join(ANIME_FOLDER, 'Episode 2'));
    });

    it('ignores episodes that are not downloaded when it looks for the folder of the anime', () => {
        const { queue, downloads, db, anime } = withDownloaded(join('/media', 'My Naruto', 'Episode 1', 'Naruto Episode 1.mp4'), [join('/media', 'My Naruto')]);
        db.markFailed(db.ensureEpisode(anime.id, '1').id, 'error', { code: 'UNKNOWN', raw: 'x' });
        queue.enqueue({ ...REQUEST, episodes: ['2'] });
        expect(downloads[0]?.options.downloadDir).toBe(join(ANIME_FOLDER, 'Episode 2'));
    });
});

describe('AnimeDownloadQueue series', () => {
    const SERIES_REQUEST: AnimeDownloadRequest = { title: 'Frieren Season 2', query: 'frieren', index: 2, audio: 'sub', episodes: ['1', '2'], series: 'Frieren', season: 2 };

    it('saves the series and the season with the anime', () => {
        const { queue, db } = setup();
        queue.enqueue(SERIES_REQUEST);
        expect(db.getAnime(1)).toMatchObject({ title: 'Frieren Season 2', series: 'Frieren', season: 2 });
    });

    it('downloads into the folder of the season, inside the folder of the series', () => {
        const { queue, downloads, ensureDirectory } = setup({ maxConcurrent: 2 });
        queue.enqueue(SERIES_REQUEST);
        expect(downloads[0]?.options.downloadDir).toBe(join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Frieren', 'Season 2', 'Episode 1'));
        expect(downloads[1]?.options.downloadDir).toBe(join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Frieren', 'Season 2', 'Episode 2'));
        expect(ensureDirectory).toHaveBeenNthCalledWith(1, join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Frieren', 'Season 2', 'Episode 1'));
    });

    it('joins the series with the spelling the library already has, so the folders are the same', () => {
        const { queue, downloads, db } = setup({ maxConcurrent: 2 });
        queue.enqueue({ ...SERIES_REQUEST, title: 'Frieren', season: 1, episodes: ['1'], index: 1 });
        queue.enqueue({ ...SERIES_REQUEST, series: ' FRIEREN ', episodes: ['1'] });
        expect(db.getAnime(2)).toMatchObject({ series: 'Frieren', season: 2 });
        expect(downloads[1]?.options.downloadDir).toBe(join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Frieren', 'Season 2', 'Episode 1'));
    });

    it('saves the name the anime is shown with, and keeps it when a later request does not say one', () => {
        const { queue, db } = setup();
        queue.enqueue({ ...SERIES_REQUEST, seasonName: 'The Second One', episodes: ['1'] });
        expect(db.getAnime(1)).toMatchObject({ season: 2, seasonName: 'The Second One' });
        queue.enqueue({ ...SERIES_REQUEST, episodes: ['2'] });
        expect(db.getAnime(1)?.seasonName).toBe('The Second One');
        queue.enqueue({ ...SERIES_REQUEST, seasonName: null, episodes: ['3'] });
        expect(db.getAnime(1)?.seasonName).toBeNull();
    });

    it('puts two seasons of a series side by side', () => {
        const { queue, downloads } = setup({ maxConcurrent: 2 });
        queue.enqueue({ ...SERIES_REQUEST, title: 'Frieren', season: 1, episodes: ['1'], index: 1 });
        queue.enqueue({ ...SERIES_REQUEST, episodes: ['1'] });
        expect(downloads[0]?.options.downloadDir).toBe(join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Frieren', 'Season 1', 'Episode 1'));
        expect(downloads[1]?.options.downloadDir).toBe(join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Frieren', 'Season 2', 'Episode 1'));
    });

    it('uses the folder of the series of the settings and the rules of the system the files are on', () => {
        const { queue, downloads } = setup({ animeDownloadDir: 'D:\\Anime' }, {}, { platform: 'win32', downloads: 'C:\\Users\\me\\Downloads' });
        queue.enqueue({ ...SERIES_REQUEST, series: 'Re:Zero', episodes: ['1'] });
        expect(downloads[0]?.options.downloadDir).toBe('D:\\Anime\\Re_Zero\\Season 2\\Episode 1');
    });

    it('keeps an anime that is not in a series in a folder of its own, as before', () => {
        const { queue, downloads } = setup();
        queue.enqueue({ ...REQUEST, episodes: ['1'] });
        expect(downloads[0]?.options.downloadDir).toBe(join(DOWNLOADS, DEFAULT_ANIME_FOLDER, 'Naruto', 'Episode 1'));
    });

    it('leaves the series of an anime as it is when the request does not say one', () => {
        const { queue, db } = setup();
        queue.enqueue({ ...SERIES_REQUEST, episodes: ['1'] });
        queue.enqueue({ ...SERIES_REQUEST, series: undefined, season: undefined, episodes: ['2'] });
        expect(db.getAnime(1)).toMatchObject({ series: 'Frieren', season: 2 });
    });

    it('keeps downloading into the folder an anime already has, even after it was joined to a series', () => {
        const { queue, downloads, db } = setup({}, {}, { directories: ['/media/My Naruto'] });
        const anime = db.upsertAnime({ title: 'Naruto', query: 'naruto', searchIndex: 2, audio: 'sub' });
        db.markDone(db.ensureEpisode(anime.id, '1').id, join('/media/My Naruto', 'Episode 1', 'Naruto Episode 1.mp4'), 10);
        queue.enqueue({ ...REQUEST, series: 'Naruto Series', season: 1, episodes: ['2'] });
        expect(downloads[0]?.options.downloadDir).toBe(join('/media/My Naruto', 'Episode 2'));
    });

    it('does not join the anime when the season is taken by another anime of the series', () => {
        const { queue, db } = setup();
        queue.enqueue({ ...SERIES_REQUEST, title: 'Frieren', season: 2, episodes: ['1'] });
        queue.enqueue({ ...SERIES_REQUEST, episodes: ['1'] });
        expect(db.getAnime(2)).toMatchObject({ title: 'Frieren Season 2', series: null, season: null });
    });
});
