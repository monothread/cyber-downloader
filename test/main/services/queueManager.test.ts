import { DEFAULT_SETTINGS } from '@shared/constants';
import type { DownloadError, DownloadJob, HistoryEntry, ProgressInfo, Settings } from '@shared/types';
import { QueueManager } from '@main/services/queueManager';
import { buildYtdlpArgs } from '@main/services/ytdlpArgsBuilder';
import type { RunHandle, RunResult } from '@main/services/ytdlpRunner';

interface ControlledRun {
    binary: string;
    args: string[];
    onProgress: (progress: ProgressInfo) => void;
    resolve: (result: RunResult) => void;
    cancel: ReturnType<typeof vi.fn>;
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
        startRun: (binary, args, onProgress): RunHandle => {
            let resolveResult: (result: RunResult) => void = () => {
                return undefined;
            };
            const result = new Promise<RunResult>((resolve) => {
                resolveResult = resolve;
            });
            const cancel = vi.fn(() => {
                resolveResult({ status: 'cancelled' });
            });
            runs.push({ binary, args, onProgress, resolve: resolveResult, cancel });
            return { result, cancel };
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
    return { queue, runs, updates, removed, history, onHistoryChanged, currentSettings };
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
            createdAt: 1001
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
        runs[0]?.onProgress({ percent: 42.5, speed: '1MiB/s', eta: '00:10', title: 'My Video' });
        runs[0]?.onProgress({ percent: 50, speed: '2MiB/s', eta: '00:05', title: '' });
        expect(queue.list()[0]).toMatchObject({ percent: 50, speed: '2MiB/s', eta: '00:05', title: 'My Video' });
    });

    it('marks a job done, records history and notifies', async () => {
        const { queue, runs, history, onHistoryChanged } = setup();
        queue.add(URL_A);
        runs[0]?.onProgress({ percent: 90, speed: '1MiB/s', eta: '00:01', title: 'My Video' });
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
        runs[0]?.onProgress({ percent: 30, speed: '1MiB/s', eta: '00:10', title: 'T' });
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

