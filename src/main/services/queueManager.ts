import { randomUUID } from 'node:crypto';
import { isValidHttpUrl } from '@shared/url';
import { statSync } from 'node:fs';
import type { AddJobResult, DownloadJob, DownloadError, DownloadInfo, HistoryEntry, ProgressInfo, Settings } from '@shared/types';
import type { RunHandle, RunResult } from './ytdlpRunner';
import { buildYtdlpArgs, type RequestExtras } from './ytdlpArgsBuilder';

export interface QueueDependencies {
    getSettings: () => Settings;
    defaultDownloadDir: string;
    resolveYtdlpPath: (settings: Settings) => string;
    resolveFfmpegLocation: (settings: Settings) => string | null;
    startRun: (binary: string, args: string[], onProgress: (progress: ProgressInfo) => void, onInfo: (info: DownloadInfo) => void) => RunHandle;
    // Size of a file on disk, or null when it does not exist (used to show how much of a live stream is recorded).
    fileSize?: (path: string) => number | null;
    addHistory: (entry: HistoryEntry) => void;
    onJobUpdate: (job: DownloadJob) => void;
    onJobRemoved: (id: string) => void;
    onHistoryChanged: () => void;
    generateId?: () => string;
    now?: () => number;
}

export const LIVE_TICK_MS = 1000;
export const LIVE_STOP_TIMEOUT_MS = 8000;

function defaultFileSize(path: string): number | null {
    try {
        return statSync(path).size;
    } catch {
        return null;
    }
}

const FINISHED_STATUSES: ReadonlyArray<DownloadJob['status']> = ['done', 'error', 'cancelled'];

function isFinished(job: DownloadJob): boolean {
    return FINISHED_STATUSES.includes(job.status);
}

export class QueueManager {
    private readonly jobs: DownloadJob[] = [];
    private readonly handles = new Map<string, RunHandle>();
    private readonly extras = new Map<string, RequestExtras>();
    private readonly tickers = new Map<string, ReturnType<typeof setInterval>>();
    private closed = false;
    private readonly generateId: () => string;
    private readonly now: () => number;

    constructor(private readonly deps: QueueDependencies) {
        this.generateId = deps.generateId ?? randomUUID;
        this.now = deps.now ?? Date.now;
    }

    list(): DownloadJob[] {
        return this.jobs.map((job) => {
            return { ...job };
        });
    }

    pendingCount(): number {
        return this.jobs.filter((job) => {
            return job.status === 'running' || job.status === 'queued';
        }).length;
    }

    hasLiveJobs(): boolean {
        return this.jobs.some((job) => {
            return job.status === 'running' && job.live;
        });
    }

    // Stops a live recording keeping what was recorded so far (the download then completes normally).
    stop(id: string): void {
        const job = this.find(id);
        if (job?.status === 'running' && job.live) {
            this.handles.get(id)?.stop();
        }
    }

    // Live recordings are asked to finish (and given a moment to save their file); everything else is cancelled.
    async shutdown(timeoutMs: number = LIVE_STOP_TIMEOUT_MS): Promise<void> {
        this.closed = true;
        const waiting: Array<Promise<unknown>> = [];
        this.handles.forEach((handle, id) => {
            if (this.find(id)?.live) {
                handle.stop();
                waiting.push(handle.result);
            } else {
                handle.cancel();
            }
        });
        if (waiting.length > 0) {
            await Promise.race([
                Promise.allSettled(waiting),
                new Promise((resolve) => {
                    setTimeout(resolve, timeoutMs);
                })
            ]);
        }
    }

    getJob(id: string): DownloadJob | undefined {
        const job = this.find(id);
        return job ? { ...job } : undefined;
    }

    add(url: string, options: RequestExtras = {}): AddJobResult {
        const trimmed = url.trim();
        if (!isValidHttpUrl(trimmed)) {
            return { ok: false, job: null, message: 'Invalid URL. Use an http(s) link.' };
        }
        const job: DownloadJob = {
            id: this.generateId(),
            url: trimmed,
            status: 'queued',
            title: options.title ?? null,
            percent: 0,
            speed: '',
            eta: '',
            filePath: null,
            error: null,
            createdAt: this.now(),
            pageUrl: options.pageUrl ?? null,
            live: false,
            elapsedSeconds: 0,
            downloadedBytes: 0
        };
        this.jobs.push(job);
        this.extras.set(job.id, options);
        this.emit(job);
        this.pump();
        return { ok: true, job: { ...job }, message: null };
    }

    cancel(id: string): void {
        const job = this.find(id);
        if (!job) {
            return;
        }
        if (job.status === 'running') {
            this.handles.get(id)?.cancel();
            return;
        }
        if (job.status === 'queued') {
            job.status = 'cancelled';
            this.emit(job);
        }
    }

    retry(id: string): void {
        const job = this.find(id);
        if (!job || (job.status !== 'error' && job.status !== 'cancelled')) {
            return;
        }
        Object.assign(job, { status: 'queued', percent: 0, speed: '', eta: '', error: null, filePath: null, live: false, elapsedSeconds: 0, downloadedBytes: 0 });
        this.emit(job);
        this.pump();
    }

    remove(id: string): void {
        const job = this.find(id);
        if (!job) {
            return;
        }
        if (job.status === 'running') {
            this.handles.get(id)?.cancel();
        }
        this.jobs.splice(this.jobs.indexOf(job), 1);
        this.extras.delete(id);
        this.stopTicker(id);
        this.deps.onJobRemoved(id);
        this.pump();
    }

    clearFinished(): void {
        this.jobs
            .filter(isFinished)
            .forEach((job) => {
                this.remove(job.id);
            });
    }

    private find(id: string): DownloadJob | undefined {
        return this.jobs.find((job) => {
            return job.id === id;
        });
    }

    private emit(job: DownloadJob): void {
        this.deps.onJobUpdate({ ...job });
    }

    private pump(): void {
        if (this.closed) {
            return;
        }
        const settings = this.deps.getSettings();
        let running = this.jobs.filter((job) => {
            return job.status === 'running';
        }).length;
        for (const job of this.jobs) {
            if (running >= settings.maxConcurrent) {
                return;
            }
            if (job.status === 'queued') {
                this.start(job, settings);
                running += 1;
            }
        }
    }

    private start(job: DownloadJob, settings: Settings): void {
        job.status = 'running';
        this.emit(job);
        const args = buildYtdlpArgs(job.url, settings, this.deps.defaultDownloadDir, this.deps.resolveFfmpegLocation(settings), this.extras.get(job.id));
        const handle = this.deps.startRun(
            this.deps.resolveYtdlpPath(settings),
            args,
            (progress) => {
                this.applyProgress(job, progress);
            },
            (info) => {
                this.applyInfo(job, info);
            }
        );
        this.handles.set(job.id, handle);
        void handle.result.then((result) => {
            this.handles.delete(job.id);
            this.finish(job, result);
        });
    }

    // A live stream has no end and no size to measure a percentage against: show how long it has been recording and
    // how much was written to its partial file instead.
    private applyInfo(job: DownloadJob, info: DownloadInfo): void {
        if (!info.live || this.tickers.has(job.id)) {
            return;
        }
        job.live = true;
        const startedAt = this.now();
        const tick = (): void => {
            job.elapsedSeconds = Math.round((this.now() - startedAt) / 1000);
            const size = (this.deps.fileSize ?? defaultFileSize)(`${info.filePath}.part`) ?? (this.deps.fileSize ?? defaultFileSize)(info.filePath);
            job.downloadedBytes = size ?? job.downloadedBytes;
            this.emit(job);
        };
        this.tickers.set(job.id, setInterval(tick, LIVE_TICK_MS));
        this.emit(job);
    }

    private stopTicker(id: string): void {
        const ticker = this.tickers.get(id);
        if (ticker !== undefined) {
            clearInterval(ticker);
            this.tickers.delete(id);
        }
    }

    private applyProgress(job: DownloadJob, progress: ProgressInfo): void {
        job.live = job.live || progress.live;
        job.downloadedBytes = progress.downloadedBytes ?? job.downloadedBytes;
        if (!this.tickers.has(job.id)) {
            job.elapsedSeconds = progress.elapsedSeconds ?? job.elapsedSeconds;
        }
        job.percent = progress.percent;
        job.speed = progress.speed;
        job.eta = progress.eta;
        job.title = progress.title.length > 0 ? progress.title : job.title;
        this.emit(job);
    }

    private finish(job: DownloadJob, result: RunResult): void {
        this.stopTicker(job.id);
        if (!this.find(job.id)) {
            return;
        }
        if (result.status === 'done') {
            Object.assign(job, { status: 'done', percent: 100, speed: '', eta: '', filePath: result.filePath });
            this.recordHistory(job, 'done', null);
        } else if (result.status === 'error') {
            Object.assign(job, { status: 'error', speed: '', eta: '', error: result.error });
            this.recordHistory(job, 'error', result.error);
        } else {
            Object.assign(job, { status: 'cancelled', speed: '', eta: '' });
        }
        this.emit(job);
        this.pump();
    }

    private recordHistory(job: DownloadJob, status: 'done' | 'error', error: DownloadError | null): void {
        this.deps.addHistory({
            id: job.id,
            url: job.url,
            title: job.title ?? job.url,
            filePath: job.filePath,
            status,
            errorTitle: error?.title ?? null,
            finishedAt: this.now()
        });
        this.deps.onHistoryChanged();
    }
}
