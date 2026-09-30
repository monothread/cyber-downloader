import { DEFAULT_SETTINGS } from '@shared/constants';
import type { DownloadError, DownloadInfo, DownloadJob, HistoryEntry, ProgressInfo, Settings } from '@shared/types';
import { LIVE_TICK_MS, QueueManager } from '@main/services/queueManager';
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

function setup(settings: Partial<Settings> = {}) {
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
            downloadedBytes: 0
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

