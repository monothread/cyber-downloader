import { DEFAULT_SETTINGS } from '@shared/constants';
import type { DownloadError, DownloadInfo, DownloadJob, HistoryEntry, ProgressInfo, Settings } from '@shared/types';
import { LIVE_TICK_MS, QueueManager, type QueueDependencies } from '@main/services/queueManager';
import { buildYtdlpArgs } from '@main/services/ytdlpArgsBuilder';
import type { RunHandle, RunResult } from '@main/services/ytdlpRunner';

interface ControlledRun {
    binary: string;
    args: string[];
    onProgress: (progress: ProgressInfo) => void;
    onInfo: (info: DownloadInfo) => void;
    resolve: (result: RunResult) => void;
    cancel: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
}

function progress(overrides: Partial<ProgressInfo> = {}): ProgressInfo {
    return { percent: 0, speed: '', eta: '', title: '', downloadedBytes: null, elapsedSeconds: null, live: false, ...overrides };
}

const DOWNLOAD_ERROR: DownloadError = { code: 'NETWORK', title: 'Network failure', hint: 'Check your connection and try again.', raw: 'boom' };

function setup(settings: Partial<Settings> = {}, extraDeps: Partial<QueueDependencies> = {}) {
    const runs: ControlledRun[] = [];
    const updates: DownloadJob[] = [];
    const removed: string[] = [];
    const history: HistoryEntry[] = [];
    const onHistoryChanged = vi.fn();
    let counter = 0;
    let clock = 1000;
    const fileSizes = new Map<string, number>();
    const currentSettings: Settings = { ...DEFAULT_SETTINGS, maxConcurrent: 2, ...settings };
    const queue = new QueueManager({
        getSettings: () => {
            return currentSettings;
        },
        defaultDownloadDir: '/dl',
        resolveYtdlpPath: (resolvedSettings) => {
            return resolvedSettings.ytdlpPath.length > 0 ? resolvedSettings.ytdlpPath : 'yt-dlp';
        },
        resolveFfmpegLocation: () => {
            return '/bundled/bin';
        },
        fileSize: (path) => {
            return fileSizes.get(path) ?? null;
        },
        startRun: (binary, args, onProgress, onInfo): RunHandle => {
            let resolveResult: (result: RunResult) => void = () => {
                return undefined;
            };
            const result = new Promise<RunResult>((resolve) => {
                resolveResult = resolve;
            });
            const cancel = vi.fn(() => {
                resolveResult({ status: 'cancelled' });
            });
            const stop = vi.fn(() => {
                resolveResult({ status: 'done', filePath: '/dl/recorded.mp4' });
            });
            runs.push({ binary, args, onProgress, onInfo, resolve: resolveResult, cancel, stop });
            return { result, cancel, stop };
        },
        addHistory: (entry) => {
            history.push(entry);
        },
        onJobUpdate: (job) => {
            updates.push(job);
        },
        onJobRemoved: (id) => {
            removed.push(id);
        },
        onHistoryChanged,
        ...extraDeps,
        generateId: () => {
            counter += 1;
            return `job-${counter}`;
        },
        now: () => {
            clock += 1;
            return clock;
        }
    });
    const advanceClock = (milliseconds: number): void => {
        clock += milliseconds;
    };
    return { queue, runs, updates, removed, history, onHistoryChanged, currentSettings, fileSizes, advanceClock };
}

async function flush(): Promise<void> {
    await new Promise((resolve) => {
        setImmediate(resolve);
    });
}

const URL_A = 'https://example.com/a';
const URL_B = 'https://example.com/b';
const URL_C = 'https://example.com/c';

describe('QueueManager.add', () => {
    it('rejects invalid URLs without creating a job', () => {
        const { queue, runs, updates } = setup();
        expect(queue.add('nope')).toEqual({ ok: false, job: null, message: 'Invalid URL. Use an http(s) link.' });
        expect(queue.list()).toEqual([]);
        expect(runs).toHaveLength(0);
        expect(updates).toHaveLength(0);
    });

    it('rejects the download when auto-generated subtitles have no language, without creating a job', () => {
        const { queue, runs, updates } = setup({ writeSubtitles: true, autoSubtitles: true, subtitleLangs: '' });
        expect(queue.add(URL_A)).toEqual({
            ok: false,
            job: null,
            message: 'Auto-generated subtitles need a language. Fill in "Subtitle languages" in Settings (e.g. ja), or turn off "Include auto-generated subtitles".'
        });
        expect(queue.list()).toEqual([]);
        expect(runs).toHaveLength(0);
        expect(updates).toHaveLength(0);
    });

    it('accepts the download when auto-generated subtitles have an explicit language', () => {
        const { queue, runs } = setup({ writeSubtitles: true, autoSubtitles: true, subtitleLangs: 'ja' });
        expect(queue.add(URL_A).ok).toBe(true);
        expect(runs).toHaveLength(1);
        expect(runs[0]?.args).toEqual(expect.arrayContaining(['--write-subs', '--write-auto-subs', '--sub-langs', 'ja']));
    });

    it('accepts the download with an empty language when auto-generated subtitles are off', () => {
        const { queue, runs } = setup({ writeSubtitles: true, autoSubtitles: false, subtitleLangs: '' });
        expect(queue.add(URL_A).ok).toBe(true);
        expect(runs).toHaveLength(1);
        expect(runs[0]?.args[(runs[0]?.args.indexOf('--sub-langs') ?? 0) + 1]).toBe('all');
    });

    it('creates a job, starts it immediately and emits queued then running', () => {
        const { queue, runs, updates } = setup();
        const result = queue.add(`  ${URL_A} `);
        expect(result.ok).toBe(true);
        expect(result.message).toBeNull();
        expect(result.job).toEqual({
            id: 'job-1',
            url: URL_A,
            status: 'running',
            title: null,
            percent: 0,
            speed: '',
            eta: '',
            filePath: null,
            error: null,
            createdAt: 1001,
            pageUrl: null,
            live: false,
            elapsedSeconds: 0,
            downloadedBytes: 0,
            hasPartial: false
        });
        expect(updates.map((job) => {
            return job.status;
        })).toEqual(['queued', 'running']);
        expect(runs).toHaveLength(1);
        expect(runs[0]?.binary).toBe('yt-dlp');
        expect(runs[0]?.args).toEqual(buildYtdlpArgs(URL_A, { ...DEFAULT_SETTINGS, maxConcurrent: 2 }, '/dl', '/bundled/bin'));
    });

    it('uses the custom yt-dlp binary path', () => {
        const { queue, runs } = setup({ ytdlpPath: '/opt/yt-dlp' });
        queue.add(URL_A);
        expect(runs[0]?.binary).toBe('/opt/yt-dlp');
    });

    it('respects the concurrency limit and starts queued jobs when a slot frees', async () => {
        const { queue, runs } = setup({ maxConcurrent: 1 });
        queue.add(URL_A);
        queue.add(URL_B);
        expect(runs).toHaveLength(1);
        expect(queue.list().map((job) => {
            return job.status;
        })).toEqual(['running', 'queued']);
        runs[0]?.resolve({ status: 'done', filePath: '/dl/a.mp4' });
        await flush();
        expect(runs).toHaveLength(2);
        expect(runs[1]?.args.at(-1)).toBe(URL_B);
        expect(queue.list().map((job) => {
            return job.status;
        })).toEqual(['done', 'running']);
    });

    it('runs jobs in parallel up to the limit', () => {
        const { queue, runs } = setup({ maxConcurrent: 2 });
        queue.add(URL_A);
        queue.add(URL_B);
        queue.add(URL_C);
        expect(runs).toHaveLength(2);
        expect(queue.list().map((job) => {
            return job.status;
        })).toEqual(['running', 'running', 'queued']);
    });
});

describe('QueueManager progress and completion', () => {
    it('applies progress updates and keeps the last known title', () => {
        const { queue, runs } = setup();
        queue.add(URL_A);
        runs[0]?.onProgress(progress({ percent: 42.5, speed: '1MiB/s', eta: '00:10', title: 'My Video' }));
        runs[0]?.onProgress(progress({ percent: 50, speed: '2MiB/s', eta: '00:05', title: '' }));
        expect(queue.list()[0]).toMatchObject({ percent: 50, speed: '2MiB/s', eta: '00:05', title: 'My Video' });
    });

    it('marks a job done, records history and notifies', async () => {
        const { queue, runs, history, onHistoryChanged } = setup();
        queue.add(URL_A);
        runs[0]?.onProgress(progress({ percent: 90, speed: '1MiB/s', eta: '00:01', title: 'My Video' }));
        runs[0]?.resolve({ status: 'done', filePath: '/dl/My Video.mp4' });
        await flush();
        expect(queue.list()[0]).toMatchObject({ status: 'done', percent: 100, speed: '', eta: '', filePath: '/dl/My Video.mp4', error: null });
        expect(history).toEqual([
            { id: 'job-1', url: URL_A, title: 'My Video', filePath: '/dl/My Video.mp4', status: 'done', errorTitle: null, finishedAt: expect.any(Number) }
        ]);
        expect(onHistoryChanged).toHaveBeenCalledTimes(1);
    });

    it('marks a job as error, records history with the URL as title fallback', async () => {
        const { queue, runs, history, onHistoryChanged } = setup();
        queue.add(URL_A);
        runs[0]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
        await flush();
        expect(queue.list()[0]).toMatchObject({ status: 'error', error: DOWNLOAD_ERROR, speed: '', eta: '' });
        expect(history).toEqual([
            { id: 'job-1', url: URL_A, title: URL_A, filePath: null, status: 'error', errorTitle: 'Network failure', finishedAt: expect.any(Number) }
        ]);
        expect(onHistoryChanged).toHaveBeenCalledTimes(1);
    });

    it('marks a cancelled run without recording history', async () => {
        const { queue, runs, history, onHistoryChanged } = setup();
        queue.add(URL_A);
        runs[0]?.resolve({ status: 'cancelled' });
        await flush();
        expect(queue.list()[0]?.status).toBe('cancelled');
        expect(history).toEqual([]);
        expect(onHistoryChanged).not.toHaveBeenCalled();
    });
});

describe('QueueManager.cancel', () => {
    it('cancels a running job through its handle', async () => {
        const { queue, runs } = setup();
        queue.add(URL_A);
        queue.cancel('job-1');
        expect(runs[0]?.cancel).toHaveBeenCalledTimes(1);
        await flush();
        expect(queue.list()[0]?.status).toBe('cancelled');
    });

    it('cancels a queued job immediately without starting it', () => {
        const { queue, runs, updates } = setup({ maxConcurrent: 1 });
        queue.add(URL_A);
        queue.add(URL_B);
        queue.cancel('job-2');
        expect(queue.list()[1]?.status).toBe('cancelled');
        expect(updates.at(-1)).toMatchObject({ id: 'job-2', status: 'cancelled' });
        expect(runs).toHaveLength(1);
    });

    it('ignores unknown ids and finished jobs', async () => {
        const { queue, runs } = setup();
        queue.add(URL_A);
        runs[0]?.resolve({ status: 'done', filePath: null });
        await flush();
        queue.cancel('unknown');
        queue.cancel('job-1');
        expect(queue.list()[0]?.status).toBe('done');
        expect(runs[0]?.cancel).not.toHaveBeenCalled();
    });
});

describe('QueueManager.retry', () => {
    it('requeues a failed job and restarts it with a clean state', async () => {
        const { queue, runs } = setup();
        queue.add(URL_A);
        runs[0]?.onProgress(progress({ percent: 30, speed: '1MiB/s', eta: '00:10', title: 'T' }));
        runs[0]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
        await flush();
        queue.retry('job-1');
        expect(runs).toHaveLength(2);
        expect(queue.list()[0]).toMatchObject({ status: 'running', percent: 0, speed: '', eta: '', error: null, filePath: null });
    });

    it('requeues a cancelled job', async () => {
        const { queue, runs } = setup();
        queue.add(URL_A);
        queue.cancel('job-1');
        await flush();
        queue.retry('job-1');
        expect(runs).toHaveLength(2);
        expect(queue.list()[0]?.status).toBe('running');
    });

    it('ignores jobs that are running, done or unknown', async () => {
        const { queue, runs } = setup();
        queue.add(URL_A);
        queue.retry('job-1');
        queue.retry('missing');
        expect(runs).toHaveLength(1);
        runs[0]?.resolve({ status: 'done', filePath: null });
        await flush();
        queue.retry('job-1');
        expect(runs).toHaveLength(1);
        expect(queue.list()[0]?.status).toBe('done');
    });
});

describe('QueueManager.remove and clearFinished', () => {
    it('removes a finished job and emits the removal', async () => {
        const { queue, runs, removed } = setup();
        queue.add(URL_A);
        runs[0]?.resolve({ status: 'done', filePath: null });
        await flush();
        queue.remove('job-1');
        expect(queue.list()).toEqual([]);
        expect(removed).toEqual(['job-1']);
    });

    it('cancels the process when removing a running job and ignores its late result', async () => {
        const { queue, runs, history } = setup();
        queue.add(URL_A);
        queue.remove('job-1');
        expect(runs[0]?.cancel).toHaveBeenCalledTimes(1);
        await flush();
        expect(queue.list()).toEqual([]);
        expect(history).toEqual([]);
    });

    it('ignores unknown ids', () => {
        const { queue, removed } = setup();
        queue.remove('missing');
        expect(removed).toEqual([]);
    });

    it('starts the next queued job after removing a running one', () => {
        const { queue, runs } = setup({ maxConcurrent: 1 });
        queue.add(URL_A);
        queue.add(URL_B);
        queue.remove('job-1');
        expect(runs).toHaveLength(2);
        expect(runs[1]?.args.at(-1)).toBe(URL_B);
    });

    it('clears only finished jobs', async () => {
        const { queue, runs, removed } = setup({ maxConcurrent: 3 });
        queue.add(URL_A);
        queue.add(URL_B);
        queue.add(URL_C);
        runs[0]?.resolve({ status: 'done', filePath: null });
        runs[1]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
        await flush();
        queue.clearFinished();
        expect(removed).toEqual(['job-1', 'job-2']);
        expect(queue.list().map((job) => {
            return job.id;
        })).toEqual(['job-3']);
    });
});

describe('QueueManager partial files', () => {
    const FILE_A = '/dl/Video A [abc].mp4';
    const PARTIALS_A = [`${FILE_A}.part`, '/dl/Video A [abc].f137.mp4.part'];
    const LIVE_FILE = '/dl/Live Show [live].mp4';

    function setupWithPartials(settings: Partial<Settings> = {}) {
        const partials = new Map<string, string[]>([
            [FILE_A, PARTIALS_A],
            ['/dl/Video B [def].mp4', ['/dl/Video B [def].mp4.part']],
            [LIVE_FILE, [`${LIVE_FILE}.part`]]
        ]);
        const findPartialFiles = vi.fn((finalPath: string) => {
            return partials.get(finalPath) ?? [];
        });
        const deleteFiles = vi.fn();
        return { ...setup(settings, { findPartialFiles, deleteFiles }), findPartialFiles, deleteFiles };
    }

    async function failDownload(setupResult: ReturnType<typeof setupWithPartials>, filePath: string = FILE_A, live = false): Promise<void> {
        setupResult.queue.add(URL_A);
        setupResult.runs[0]?.onInfo({ live, filePath });
        setupResult.runs[0]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
        await flush();
    }

    describe('when the setting is on (default)', () => {
        it('is on by default', () => {
            expect(DEFAULT_SETTINGS.deletePartialsOnFailure).toBe(true);
        });

        it('deletes the partial files of a download that failed', async () => {
            const result = setupWithPartials();
            await failDownload(result);
            expect(result.findPartialFiles).toHaveBeenCalledWith(FILE_A);
            expect(result.deleteFiles).toHaveBeenCalledTimes(1);
            expect(result.deleteFiles).toHaveBeenCalledWith(PARTIALS_A);
            expect(result.queue.getJob('job-1')).toMatchObject({ status: 'error', hasPartial: false });
        });

        it('deletes the partial files of a download that was cancelled', async () => {
            const result = setupWithPartials();
            result.queue.add(URL_A);
            result.runs[0]?.onInfo({ live: false, filePath: FILE_A });
            result.queue.cancel('job-1');
            await flush();
            expect(result.deleteFiles).toHaveBeenCalledWith(PARTIALS_A);
            expect(result.queue.getJob('job-1')).toMatchObject({ status: 'cancelled', hasPartial: false });
        });

        it('deletes the partial files of every video a playlist reported, each only once', async () => {
            const result = setupWithPartials();
            result.queue.add(URL_A);
            result.runs[0]?.onInfo({ live: false, filePath: FILE_A });
            result.runs[0]?.onInfo({ live: false, filePath: FILE_A });
            result.runs[0]?.onInfo({ live: false, filePath: '/dl/Video B [def].mp4' });
            result.runs[0]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
            await flush();
            expect(result.deleteFiles).toHaveBeenCalledTimes(1);
            expect(result.deleteFiles).toHaveBeenCalledWith([...PARTIALS_A, '/dl/Video B [def].mp4.part']);
        });

        it('keeps the recording of a live stream and remembers that it is there', async () => {
            const result = setupWithPartials();
            await failDownload(result, LIVE_FILE, true);
            expect(result.deleteFiles).not.toHaveBeenCalled();
            expect(result.queue.getJob('job-1')).toMatchObject({ status: 'error', live: true, hasPartial: true });
        });

        it('does nothing for a download that never reported a file', async () => {
            const result = setupWithPartials();
            result.queue.add(URL_A);
            result.runs[0]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
            await flush();
            expect(result.findPartialFiles).not.toHaveBeenCalled();
            expect(result.deleteFiles).not.toHaveBeenCalled();
            expect(result.queue.getJob('job-1')?.hasPartial).toBe(false);
        });

        it('does nothing when the download left no partial file', async () => {
            const result = setupWithPartials();
            await failDownload(result, '/dl/Nothing.mp4');
            expect(result.deleteFiles).not.toHaveBeenCalled();
            expect(result.queue.getJob('job-1')?.hasPartial).toBe(false);
        });

        it('does not look for partial files after a download that succeeded', async () => {
            const result = setupWithPartials();
            result.queue.add(URL_A);
            result.runs[0]?.onInfo({ live: false, filePath: FILE_A });
            result.runs[0]?.resolve({ status: 'done', filePath: FILE_A });
            await flush();
            expect(result.findPartialFiles).not.toHaveBeenCalled();
            expect(result.deleteFiles).not.toHaveBeenCalled();
            expect(result.queue.getJob('job-1')).toMatchObject({ status: 'done', hasPartial: false });
        });
    });

    describe('when the setting is off', () => {
        it('keeps the partial files and marks the job so the card can offer to clear them', async () => {
            const result = setupWithPartials({ deletePartialsOnFailure: false });
            await failDownload(result);
            expect(result.deleteFiles).not.toHaveBeenCalled();
            expect(result.queue.getJob('job-1')).toMatchObject({ status: 'error', hasPartial: true });
            expect(result.updates.at(-1)).toMatchObject({ status: 'error', hasPartial: true });
        });
    });

    describe('clearPartials', () => {
        it('deletes what a failed download left behind and keeps its card', async () => {
            const result = setupWithPartials({ deletePartialsOnFailure: false });
            await failDownload(result);
            result.updates.length = 0;
            result.queue.clearPartials('job-1');
            expect(result.deleteFiles).toHaveBeenCalledTimes(1);
            expect(result.deleteFiles).toHaveBeenCalledWith(PARTIALS_A);
            expect(result.queue.getJob('job-1')).toMatchObject({ status: 'error', hasPartial: false });
            expect(result.updates).toHaveLength(1);
            expect(result.updates[0]).toMatchObject({ id: 'job-1', hasPartial: false });
        });

        it('also deletes a live recording, because the user asked for it', async () => {
            const result = setupWithPartials();
            await failDownload(result, LIVE_FILE, true);
            result.queue.clearPartials('job-1');
            expect(result.deleteFiles).toHaveBeenCalledWith([`${LIVE_FILE}.part`]);
            expect(result.queue.getJob('job-1')?.hasPartial).toBe(false);
        });

        it('ignores running, finished and unknown downloads', async () => {
            const result = setupWithPartials();
            result.queue.add(URL_A);
            result.runs[0]?.onInfo({ live: false, filePath: FILE_A });
            result.queue.clearPartials('job-1');
            result.queue.clearPartials('missing');
            result.runs[0]?.resolve({ status: 'done', filePath: FILE_A });
            await flush();
            result.queue.clearPartials('job-1');
            expect(result.deleteFiles).not.toHaveBeenCalled();
        });
    });

    describe('remove', () => {
        it('deletes what a failed download left behind', async () => {
            const result = setupWithPartials({ deletePartialsOnFailure: false });
            await failDownload(result);
            result.queue.remove('job-1');
            expect(result.deleteFiles).toHaveBeenCalledTimes(1);
            expect(result.deleteFiles).toHaveBeenCalledWith(PARTIALS_A);
            expect(result.queue.list()).toEqual([]);
        });

        it('deletes a live recording when it is removed one by one', async () => {
            const result = setupWithPartials();
            await failDownload(result, LIVE_FILE, true);
            result.queue.remove('job-1');
            expect(result.deleteFiles).toHaveBeenCalledWith([`${LIVE_FILE}.part`]);
        });

        it('does not look for files when a finished download is removed', async () => {
            const result = setupWithPartials();
            result.queue.add(URL_A);
            result.runs[0]?.onInfo({ live: false, filePath: FILE_A });
            result.runs[0]?.resolve({ status: 'done', filePath: FILE_A });
            await flush();
            result.queue.remove('job-1');
            expect(result.findPartialFiles).not.toHaveBeenCalled();
            expect(result.deleteFiles).not.toHaveBeenCalled();
        });

        it('deletes what a running download leaves behind once its process has stopped', async () => {
            const result = setupWithPartials();
            result.queue.add(URL_A);
            result.runs[0]?.onInfo({ live: false, filePath: FILE_A });
            result.queue.remove('job-1');
            expect(result.deleteFiles).not.toHaveBeenCalled();
            await flush();
            expect(result.deleteFiles).toHaveBeenCalledWith(PARTIALS_A);
            expect(result.queue.list()).toEqual([]);
        });

        it('keeps the recording of a live stream that is removed while it is running', async () => {
            const result = setupWithPartials();
            result.queue.add(URL_A);
            result.runs[0]?.onInfo({ live: true, filePath: LIVE_FILE });
            result.queue.remove('job-1');
            await flush();
            expect(result.deleteFiles).not.toHaveBeenCalled();
        });
    });

    describe('clearFinished', () => {
        it('deletes what the failed downloads left but keeps the live recordings', async () => {
            const result = setupWithPartials({ maxConcurrent: 3 });
            result.queue.add(URL_A);
            result.queue.add(URL_B);
            result.runs[0]?.onInfo({ live: false, filePath: FILE_A });
            result.runs[1]?.onInfo({ live: true, filePath: LIVE_FILE });
            result.runs[0]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
            result.runs[1]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
            await flush();
            result.deleteFiles.mockClear();
            result.queue.clearFinished();
            expect(result.deleteFiles).not.toHaveBeenCalled();
            expect(result.queue.list()).toEqual([]);
        });

        it('deletes the leftovers of failed downloads when the setting kept them', async () => {
            const result = setupWithPartials({ deletePartialsOnFailure: false });
            await failDownload(result);
            result.queue.clearFinished();
            expect(result.deleteFiles).toHaveBeenCalledWith(PARTIALS_A);
        });
    });

    describe('retry', () => {
        it('forgets the previous leftovers and keeps no flag for the new attempt', async () => {
            const result = setupWithPartials({ deletePartialsOnFailure: false });
            await failDownload(result);
            result.queue.retry('job-1');
            expect(result.queue.getJob('job-1')).toMatchObject({ status: 'running', hasPartial: false });
            result.runs[1]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
            await flush();
            expect(result.queue.getJob('job-1')).toMatchObject({ status: 'error', hasPartial: false });
            expect(result.deleteFiles).not.toHaveBeenCalled();
        });
    });
});

describe('QueueManager.list', () => {
    it('returns copies that do not mutate the internal state', () => {
        const { queue } = setup();
        queue.add(URL_A);
        const snapshot = queue.list();
        if (snapshot[0]) {
            snapshot[0].percent = 99;
        }
        expect(queue.list()[0]?.percent).toBe(0);
    });
});

describe('QueueManager.shutdown', () => {
    it('cancels every running process', () => {
        const { queue, runs } = setup({ maxConcurrent: 3 });
        queue.add(URL_A);
        queue.add(URL_B);
        queue.shutdown();
        expect(runs[0]?.cancel).toHaveBeenCalledTimes(1);
        expect(runs[1]?.cancel).toHaveBeenCalledTimes(1);
    });

    it('does not start queued jobs when a running one is cancelled', async () => {
        const { queue, runs } = setup({ maxConcurrent: 1 });
        queue.add(URL_A);
        queue.add(URL_B);
        queue.shutdown();
        await flush();
        expect(runs).toHaveLength(1);
        expect(queue.list().map((job) => {
            return job.status;
        })).toEqual(['cancelled', 'queued']);
    });

    it('does not start new jobs added after the shutdown', () => {
        const { queue, runs } = setup();
        queue.shutdown();
        const result = queue.add(URL_A);
        expect(result.ok).toBe(true);
        expect(result.job?.status).toBe('queued');
        expect(runs).toHaveLength(0);
    });

    it('does nothing when no job is running', () => {
        const { queue, runs } = setup();
        expect(() => {
            queue.shutdown();
        }).not.toThrow();
        expect(runs).toHaveLength(0);
    });
});

describe('QueueManager.pendingCount', () => {
    it('is zero for an empty queue', () => {
        expect(setup().queue.pendingCount()).toBe(0);
    });

    it('counts running and queued jobs', () => {
        const { queue } = setup({ maxConcurrent: 1 });
        queue.add(URL_A);
        queue.add(URL_B);
        expect(queue.pendingCount()).toBe(2);
    });

    it('does not count finished, failed or cancelled jobs', async () => {
        const { queue, runs } = setup({ maxConcurrent: 3 });
        queue.add(URL_A);
        queue.add(URL_B);
        queue.add(URL_C);
        runs[0]?.resolve({ status: 'done', filePath: null });
        runs[1]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
        await flush();
        expect(queue.pendingCount()).toBe(1);
        queue.cancel('job-3');
        await flush();
        expect(queue.pendingCount()).toBe(0);
    });
});

describe('QueueManager request extras (streams found on a page)', () => {
    const STREAM = 'https://cdn.test/v/master.m3u8';
    const EXTRAS = { referer: 'https://site.test/ep-1', userAgent: 'Agent/1.0', cookie: 'sid=1', title: 'Episode 1' };

    it('starts the job with the extras and shows the page title right away', () => {
        const { queue, runs } = setup();
        const result = queue.add(STREAM, EXTRAS);
        expect(result.job?.title).toBe('Episode 1');
        expect(runs[0]?.args).toEqual(buildYtdlpArgs(STREAM, { ...DEFAULT_SETTINGS, maxConcurrent: 2 }, '/dl', '/bundled/bin', EXTRAS));
        expect(runs[0]?.args).toEqual(expect.arrayContaining(['--referer', 'https://site.test/ep-1', '--user-agent', 'Agent/1.0', '--add-header', 'Cookie:sid=1']));
    });

    it('keeps the extras when the job is retried', async () => {
        const { queue, runs } = setup();
        queue.add(STREAM, EXTRAS);
        runs[0]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
        await flush();
        queue.retry('job-1');
        expect(runs[1]?.args).toEqual(runs[0]?.args);
    });

    it('forgets the extras when the job is removed', async () => {
        const { queue, runs } = setup();
        queue.add(STREAM, EXTRAS);
        runs[0]?.resolve({ status: 'done', filePath: null });
        await flush();
        queue.remove('job-1');
        queue.add(STREAM);
        expect(runs[1]?.args).not.toContain('--referer');
    });

    it('does not leak extras between jobs', () => {
        const { queue, runs } = setup({ maxConcurrent: 3 });
        queue.add(STREAM, EXTRAS);
        queue.add(URL_B);
        expect(runs[0]?.args).toContain('--referer');
        expect(runs[1]?.args).not.toContain('--referer');
        expect(runs[1]?.args).toContain('%(title).80s [%(id)s].%(ext)s');
    });
});

describe('QueueManager page address and IP family extras', () => {
    it('remembers the page a stream came from on the job and forces the bound IP family', () => {
        const { queue, runs } = setup();
        const result = queue.add('https://cdn.test/videoplayback?ip=2001:db8::1', { pageUrl: 'https://site.test/ep-1', ipFamily: 6 });
        expect(result.job?.pageUrl).toBe('https://site.test/ep-1');
        expect(queue.getJob('job-1')?.pageUrl).toBe('https://site.test/ep-1');
        expect(runs[0]?.args).toContain('--force-ipv6');
        expect(runs[0]?.args).not.toContain('https://site.test/ep-1');
    });

    it('has no page address for a link the user pasted', () => {
        const { queue } = setup();
        expect(queue.add(URL_A).job?.pageUrl).toBeNull();
    });

    it('keeps the page address and the IP family when the job is retried', async () => {
        const { queue, runs } = setup();
        queue.add('https://cdn.test/v?ip=203.0.113.9', { pageUrl: 'https://site.test/ep-1', ipFamily: 4 });
        runs[0]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
        await flush();
        queue.retry('job-1');
        expect(runs[1]?.args).toContain('--force-ipv4');
        expect(queue.getJob('job-1')?.pageUrl).toBe('https://site.test/ep-1');
    });
});

describe('QueueManager.getJob', () => {
    it('returns a copy of the job', () => {
        const { queue } = setup();
        queue.add(URL_A);
        const job = queue.getJob('job-1');
        expect(job).toMatchObject({ id: 'job-1', url: URL_A, status: 'running' });
        if (job) {
            job.percent = 50;
        }
        expect(queue.getJob('job-1')?.percent).toBe(0);
    });

    it('returns undefined for unknown ids', () => {
        expect(setup().queue.getJob('nope')).toBeUndefined();
    });
});

describe('QueueManager live recordings', () => {
    const LIVE_FILE = '/dl/Live Show [abc].mp4';
    const liveInfo = { live: true, filePath: LIVE_FILE };

    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('marks a job as live when yt-dlp announces a live stream', () => {
        const { queue, runs } = setup();
        queue.add(URL_A);
        expect(queue.getJob('job-1')?.live).toBe(false);
        runs[0]?.onInfo(liveInfo);
        expect(queue.getJob('job-1')).toMatchObject({ live: true, status: 'running', elapsedSeconds: 0, downloadedBytes: 0 });
    });

    it('does not mark ordinary downloads as live', () => {
        const { queue, runs } = setup();
        queue.add(URL_A);
        runs[0]?.onInfo({ live: false, filePath: '/dl/v.mp4' });
        vi.advanceTimersByTime(LIVE_TICK_MS * 3);
        expect(queue.getJob('job-1')).toMatchObject({ live: false, elapsedSeconds: 0 });
    });

    it('counts the recording time and reads the size of the partial file every second', () => {
        const { queue, runs, fileSizes, updates, advanceClock } = setup();
        queue.add(URL_A);
        runs[0]?.onInfo(liveInfo);
        fileSizes.set(`${LIVE_FILE}.part`, 5000);
        advanceClock(3000);
        vi.advanceTimersByTime(LIVE_TICK_MS);
        expect(queue.getJob('job-1')).toMatchObject({ elapsedSeconds: 3, downloadedBytes: 5000 });
        fileSizes.set(`${LIVE_FILE}.part`, 9000);
        advanceClock(2000);
        vi.advanceTimersByTime(LIVE_TICK_MS);
        expect(queue.getJob('job-1')).toMatchObject({ elapsedSeconds: 5, downloadedBytes: 9000 });
        expect(updates.at(-1)).toMatchObject({ id: 'job-1', live: true, elapsedSeconds: 5, downloadedBytes: 9000 });
    });

    it('falls back to the finished file when there is no partial file, and keeps the last size when neither exists', () => {
        const { queue, runs, fileSizes } = setup();
        queue.add(URL_A);
        runs[0]?.onInfo(liveInfo);
        fileSizes.set(LIVE_FILE, 777);
        vi.advanceTimersByTime(LIVE_TICK_MS);
        expect(queue.getJob('job-1')?.downloadedBytes).toBe(777);
        fileSizes.clear();
        vi.advanceTimersByTime(LIVE_TICK_MS);
        expect(queue.getJob('job-1')?.downloadedBytes).toBe(777);
    });

    it('starts a single ticker even if the stream is announced twice', () => {
        const { queue, runs, updates } = setup();
        queue.add(URL_A);
        runs[0]?.onInfo(liveInfo);
        runs[0]?.onInfo(liveInfo);
        const before = updates.length;
        vi.advanceTimersByTime(LIVE_TICK_MS);
        expect(updates.length - before).toBe(1);
    });

    it('uses the numbers reported by yt-dlp at the end of a live recording', () => {
        const { queue, runs } = setup();
        queue.add(URL_A);
        runs[0]?.onProgress(progress({ percent: 100, live: true, downloadedBytes: 648600, elapsedSeconds: 16 }));
        expect(queue.getJob('job-1')).toMatchObject({ live: true, downloadedBytes: 648600, elapsedSeconds: 16 });
    });

    it('does not let the reported elapsed time override the live ticker', () => {
        const { queue, runs, advanceClock } = setup();
        queue.add(URL_A);
        runs[0]?.onInfo(liveInfo);
        advanceClock(4000);
        vi.advanceTimersByTime(LIVE_TICK_MS);
        runs[0]?.onProgress(progress({ live: true, elapsedSeconds: 1 }));
        expect(queue.getJob('job-1')?.elapsedSeconds).toBe(4);
    });

    it('stops ticking when the recording ends', async () => {
        const { queue, runs, updates } = setup();
        queue.add(URL_A);
        runs[0]?.onInfo(liveInfo);
        runs[0]?.resolve({ status: 'done', filePath: LIVE_FILE });
        await vi.advanceTimersByTimeAsync(0);
        const before = updates.length;
        vi.advanceTimersByTime(LIVE_TICK_MS * 5);
        expect(updates.length).toBe(before);
        expect(queue.getJob('job-1')).toMatchObject({ status: 'done', live: true, filePath: LIVE_FILE });
    });

    it('stops ticking when the job is removed', () => {
        const { queue, runs, updates } = setup();
        queue.add(URL_A);
        runs[0]?.onInfo(liveInfo);
        queue.remove('job-1');
        const before = updates.length;
        vi.advanceTimersByTime(LIVE_TICK_MS * 3);
        expect(updates.length).toBe(before);
    });

    it('stop asks the running live recording to finish and completes it with its file', async () => {
        const { queue, runs, history } = setup();
        queue.add(URL_A);
        runs[0]?.onInfo(liveInfo);
        queue.stop('job-1');
        expect(runs[0]?.stop).toHaveBeenCalledTimes(1);
        expect(runs[0]?.cancel).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(0);
        expect(queue.getJob('job-1')).toMatchObject({ status: 'done', filePath: '/dl/recorded.mp4' });
        expect(history).toHaveLength(1);
    });

    it('stop ignores jobs that are not live, not running or unknown', async () => {
        const { queue, runs } = setup({ maxConcurrent: 1 });
        queue.add(URL_A);
        queue.add(URL_B);
        queue.stop('job-1');
        queue.stop('job-2');
        queue.stop('missing');
        expect(runs[0]?.stop).not.toHaveBeenCalled();
        runs[0]?.onInfo(liveInfo);
        runs[0]?.resolve({ status: 'done', filePath: LIVE_FILE });
        await vi.advanceTimersByTimeAsync(0);
        queue.stop('job-1');
        expect(runs[0]?.stop).not.toHaveBeenCalled();
    });

    it('cancel still discards a live recording', async () => {
        const { queue, runs } = setup();
        queue.add(URL_A);
        runs[0]?.onInfo(liveInfo);
        queue.cancel('job-1');
        expect(runs[0]?.cancel).toHaveBeenCalledTimes(1);
        expect(runs[0]?.stop).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(0);
        expect(queue.getJob('job-1')?.status).toBe('cancelled');
    });

    it('resets the live fields when a failed recording is retried', async () => {
        const { queue, runs, fileSizes } = setup();
        queue.add(URL_A);
        runs[0]?.onInfo(liveInfo);
        fileSizes.set(`${LIVE_FILE}.part`, 100);
        vi.advanceTimersByTime(LIVE_TICK_MS);
        runs[0]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
        await vi.advanceTimersByTimeAsync(0);
        queue.retry('job-1');
        expect(queue.getJob('job-1')).toMatchObject({ live: false, elapsedSeconds: 0, downloadedBytes: 0, status: 'running' });
    });

    it('reports whether a live recording is running', async () => {
        const { queue, runs } = setup();
        expect(queue.hasLiveJobs()).toBe(false);
        queue.add(URL_A);
        expect(queue.hasLiveJobs()).toBe(false);
        runs[0]?.onInfo(liveInfo);
        expect(queue.hasLiveJobs()).toBe(true);
        runs[0]?.resolve({ status: 'done', filePath: LIVE_FILE });
        await vi.advanceTimersByTimeAsync(0);
        expect(queue.hasLiveJobs()).toBe(false);
    });

    describe('shutdown', () => {
        it('asks live recordings to finish and waits for them, cancelling everything else', async () => {
            const { queue, runs } = setup({ maxConcurrent: 3 });
            queue.add(URL_A);
            queue.add(URL_B);
            runs[0]?.onInfo(liveInfo);
            const shutdown = queue.shutdown();
            await vi.advanceTimersByTimeAsync(0);
            await shutdown;
            expect(runs[0]?.stop).toHaveBeenCalledTimes(1);
            expect(runs[0]?.cancel).not.toHaveBeenCalled();
            expect(runs[1]?.cancel).toHaveBeenCalledTimes(1);
            expect(runs[1]?.stop).not.toHaveBeenCalled();
        });

        it('does not wait forever for a recording that never finishes', async () => {
            const { queue, runs } = setup();
            queue.add(URL_A);
            runs[0]?.onInfo(liveInfo);
            runs[0]?.stop.mockImplementation(() => {
                return undefined;
            });
            let finished = false;
            const shutdown = queue.shutdown(5000).then(() => {
                finished = true;
            });
            await vi.advanceTimersByTimeAsync(4999);
            expect(finished).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
            await shutdown;
            expect(finished).toBe(true);
        });

        it('resolves immediately when there are no live recordings and starts nothing new afterwards', async () => {
            const { queue, runs } = setup({ maxConcurrent: 1 });
            queue.add(URL_A);
            queue.add(URL_B);
            await queue.shutdown();
            expect(runs[0]?.cancel).toHaveBeenCalledTimes(1);
            await vi.advanceTimersByTimeAsync(0);
            expect(runs).toHaveLength(1);
        });
    });
});

describe('QueueManager with a recording that was ended by killing yt-dlp (Windows)', () => {
    const LIVE_FILE = 'C:\\dl\\Live Show [abc].mp4';
    const liveInfo = { live: true, filePath: LIVE_FILE };

    function startLive(salvage: QueueDependencies['salvageRecording']) {
        const context = setup({}, salvage ? { salvageRecording: salvage } : {});
        context.queue.add(URL_A);
        context.runs[0]?.onInfo(liveInfo);
        return context;
    }

    it('salvages the partial file and completes the job with the saved file', async () => {
        const salvage = vi.fn<(path: string) => Promise<string | null>>().mockResolvedValue(LIVE_FILE);
        const { queue, runs, history, onHistoryChanged } = startLive(salvage);
        runs[0]?.resolve({ status: 'stopped' });
        await flush();
        expect(salvage).toHaveBeenCalledTimes(1);
        expect(salvage).toHaveBeenCalledWith(LIVE_FILE);
        expect(queue.getJob('job-1')).toMatchObject({ status: 'done', percent: 100, filePath: LIVE_FILE, error: null, live: true });
        expect(history).toEqual([
            { id: 'job-1', url: URL_A, title: URL_A, filePath: LIVE_FILE, status: 'done', errorTitle: null, finishedAt: expect.any(Number) }
        ]);
        expect(onHistoryChanged).toHaveBeenCalledTimes(1);
    });

    it('fails with a clear error when the partial file cannot be saved', async () => {
        const { queue, runs, history } = startLive(async () => {
            return null;
        });
        runs[0]?.resolve({ status: 'stopped' });
        await flush();
        const job = queue.getJob('job-1');
        expect(job?.status).toBe('error');
        expect(job?.filePath).toBeNull();
        expect(job?.error).toEqual({
            code: 'UNKNOWN',
            title: 'The recording could not be saved',
            hint: 'The stream was stopped, but the partial file could not be converted. A file ending in .part may still be in the download folder.',
            raw: 'ffmpeg could not copy the partial recording into the final file.'
        });
        expect(history).toHaveLength(1);
        expect(history[0]).toMatchObject({ status: 'error', errorTitle: 'The recording could not be saved' });
    });

    it('fails the same way when salvaging throws', async () => {
        const { queue, runs } = startLive(async () => {
            throw new Error('ffmpeg crashed');
        });
        runs[0]?.resolve({ status: 'stopped' });
        await flush();
        expect(queue.getJob('job-1')?.status).toBe('error');
    });

    it('fails when there is no way to salvage', async () => {
        const { queue, runs } = startLive(undefined);
        runs[0]?.resolve({ status: 'stopped' });
        await flush();
        expect(queue.getJob('job-1')?.status).toBe('error');
    });

    it('fails when yt-dlp never said where the recording was written', async () => {
        const salvage = vi.fn<(path: string) => Promise<string | null>>().mockResolvedValue(LIVE_FILE);
        const { queue, runs } = setup({}, { salvageRecording: salvage });
        queue.add(URL_A);
        runs[0]?.resolve({ status: 'stopped' });
        await flush();
        expect(salvage).not.toHaveBeenCalled();
        expect(queue.getJob('job-1')?.status).toBe('error');
    });

    it('starts the next queued job once the recording has been saved', async () => {
        const { queue, runs } = setup({ maxConcurrent: 1 }, {
            salvageRecording: async () => {
                return LIVE_FILE;
            }
        });
        queue.add(URL_A);
        queue.add(URL_B);
        runs[0]?.onInfo(liveInfo);
        expect(runs).toHaveLength(1);
        runs[0]?.resolve({ status: 'stopped' });
        await flush();
        expect(runs).toHaveLength(2);
        expect(runs[1]?.args.at(-1)).toBe(URL_B);
    });

    it('shutdown waits for the recording to be saved before it resolves', async () => {
        let finishSalvage: (path: string) => void = () => {
            return undefined;
        };
        const { queue, runs } = setup({}, {
            salvageRecording: () => {
                return new Promise<string | null>((resolve) => {
                    finishSalvage = resolve;
                });
            }
        });
        queue.add(URL_A);
        runs[0]?.onInfo(liveInfo);
        runs[0]?.stop.mockImplementation(() => {
            runs[0]?.resolve({ status: 'stopped' });
        });
        let shutdownDone = false;
        const shutdown = queue.shutdown(60000).then(() => {
            shutdownDone = true;
        });
        await flush();
        expect(shutdownDone).toBe(false);
        finishSalvage(LIVE_FILE);
        await shutdown;
        expect(shutdownDone).toBe(true);
    });
});

describe('QueueManager with a folder chosen for one download', () => {
    it('downloads into that folder and keeps it when the job is retried', () => {
        const { queue, runs } = setup();
        queue.add(URL_A, { downloadDir: '/media/special' });
        expect(runs[0]?.args[(runs[0]?.args.indexOf('-P') ?? 0) + 1]).toBe('/media/special');
        runs[0]?.resolve({ status: 'error', error: DOWNLOAD_ERROR });
        return flush().then(() => {
            queue.retry('job-1');
            expect(runs).toHaveLength(2);
            expect(runs[1]?.args[(runs[1]?.args.indexOf('-P') ?? 0) + 1]).toBe('/media/special');
        });
    });

    it('uses the settings folder for the other downloads', () => {
        const { queue, runs } = setup({ downloadDir: '/from/settings' });
        queue.add(URL_A, { downloadDir: '/media/special' });
        queue.add(URL_B);
        expect(runs[1]?.args[(runs[1]?.args.indexOf('-P') ?? 0) + 1]).toBe('/from/settings');
    });
});

