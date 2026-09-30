import { randomUUID } from 'node:crypto';
import { isValidHttpUrl } from '@shared/url';
import type { AddJobResult, DownloadJob, DownloadError, HistoryEntry, ProgressInfo, Settings } from '@shared/types';
import type { RunHandle, RunResult } from './ytdlpRunner';
import { buildYtdlpArgs } from './ytdlpArgsBuilder';

export interface QueueDependencies {
    getSettings: () => Settings;
    defaultDownloadDir: string;
    resolveYtdlpPath: (settings: Settings) => string;
    resolveFfmpegLocation: (settings: Settings) => string | null;
    startRun: (binary: string, args: string[], onProgress: (progress: ProgressInfo) => void) => RunHandle;
    addHistory: (entry: HistoryEntry) => void;
    onJobUpdate: (job: DownloadJob) => void;
    onJobRemoved: (id: string) => void;
    onHistoryChanged: () => void;
    generateId?: () => string;
    now?: () => number;
}

const FINISHED_STATUSES: ReadonlyArray<DownloadJob['status']> = ['done', 'error', 'cancelled'];

function isFinished(job: DownloadJob): boolean {
    return FINISHED_STATUSES.includes(job.status);
}

export class QueueManager {
    private readonly jobs: DownloadJob[] = [];
    private readonly handles = new Map<string, RunHandle>();
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

    shutdown(): void {
        this.closed = true;
        this.handles.forEach((handle) => {
            handle.cancel();
        });
    }

    add(url: string): AddJobResult {
        const trimmed = url.trim();
        if (!isValidHttpUrl(trimmed)) {
            return { ok: false, job: null, message: 'Invalid URL. Use an http(s) link.' };
        }
        const job: DownloadJob = {
            id: this.generateId(),
            url: trimmed,
            status: 'queued',
            title: null,
            percent: 0,
            speed: '',
            eta: '',
            filePath: null,
            error: null,
            createdAt: this.now()
        };
        this.jobs.push(job);
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
        Object.assign(job, { status: 'queued', percent: 0, speed: '', eta: '', error: null, filePath: null });
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
        const args = buildYtdlpArgs(job.url, settings, this.deps.defaultDownloadDir, this.deps.resolveFfmpegLocation(settings));
        const handle = this.deps.startRun(this.deps.resolveYtdlpPath(settings), args, (progress) => {
            this.applyProgress(job, progress);
        });
        this.handles.set(job.id, handle);
        void handle.result.then((result) => {
            this.handles.delete(job.id);
            this.finish(job, result);
        });
    }

    private applyProgress(job: DownloadJob, progress: ProgressInfo): void {
        job.percent = progress.percent;
        job.speed = progress.speed;
        job.eta = progress.eta;
        job.title = progress.title.length > 0 ? progress.title : job.title;
        this.emit(job);
    }

    private finish(job: DownloadJob, result: RunResult): void {
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
