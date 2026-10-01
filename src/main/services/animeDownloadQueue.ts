import { posix, win32 } from 'node:path';
import type { AniDownloadProgress, AniError, AnimeDownloadRequest, AnimeEpisodeRecord, AnimeJob, AnimeRecord, LibraryAnime } from '@shared/anime';
import type { Settings } from '@shared/types';
import type { AnimeDb } from './animeDb';
import { animeBaseDirectory, animeDownloadDirectory, animeFileName } from './animeFiles';
import type { AniDownloadHandle, AniDownloadOptions } from './aniCliService';

// Progress lines come many times a second; the screen only needs to hear about a visible change.
const MIN_PERCENT_STEP = 0.5;

export interface AnimeQueueDependencies {
    db: AnimeDb;
    download: (options: AniDownloadOptions) => AniDownloadHandle;
    getSettings: () => Settings;
    defaultDownloadDir: string;
    ensureDirectory: (path: string) => void;
    // The size of a file, or null when it is not there.
    fileSize: (path: string) => number | null;
    onJobUpdate: (job: AnimeJob) => void;
    onLibraryChanged: () => void;
    // The system the files are on (decides the rules of file names); this one by default.
    platform?: NodeJS.Platform;
}

function isActive(job: AnimeJob): boolean {
    return job.status === 'queued' || job.status === 'running';
}

export class AnimeDownloadQueue {
    private readonly jobs = new Map<number, AnimeJob>();
    private readonly handles = new Map<number, AniDownloadHandle>();
    private readonly lastReported = new Map<number, number>();

    constructor(private readonly deps: AnimeQueueDependencies) {}

    list(): AnimeJob[] {
        return [...this.jobs.values()];
    }

    pendingCount(): number {
        return this.list().filter(isActive).length;
    }

    // Queues the episodes (the ones already downloaded or already waiting are left as they are) and returns the anime.
    enqueue(request: AnimeDownloadRequest): LibraryAnime | null {
        const anime = this.deps.db.upsertAnime({ title: request.title, query: request.query, searchIndex: request.index, audio: request.audio });
        request.episodes.forEach((number) => {
            this.queueEpisode(anime, this.deps.db.ensureEpisode(anime.id, number));
        });
        this.deps.onLibraryChanged();
        this.pump();
        return this.deps.db.getLibraryAnime(anime.id);
    }

    // Queues an episode of the library again (after an error or a cancellation, also after the app was restarted).
    retry(episodeId: number): void {
        const episode = this.deps.db.getEpisode(episodeId);
        const anime = episode ? this.deps.db.getAnime(episode.animeId) : null;
        if (!episode || !anime || episode.status === 'done' || this.isActiveJob(episodeId)) {
            return;
        }
        this.queueEpisode(anime, this.deps.db.ensureEpisode(anime.id, episode.number));
        this.deps.onLibraryChanged();
        this.pump();
    }

    cancel(episodeId: number): void {
        const job = this.jobs.get(episodeId);
        if (!job || !isActive(job)) {
            return;
        }
        const handle = this.handles.get(episodeId);
        if (handle) {
            // The result of the run settles the job.
            handle.cancel();
            return;
        }
        this.deps.db.markFailed(episodeId, 'cancelled', null);
        this.update(job, { status: 'cancelled' });
        this.deps.onLibraryChanged();
    }

    clearFinished(): void {
        this.list().forEach((job) => {
            if (!isActive(job)) {
                this.jobs.delete(job.episodeId);
            }
        });
    }

    // The episodes are gone from the library: whatever is still running for them is stopped and forgotten.
    forget(episodeIds: number[]): void {
        episodeIds.forEach((episodeId) => {
            this.handles.get(episodeId)?.cancel();
            this.handles.delete(episodeId);
            this.jobs.delete(episodeId);
            this.lastReported.delete(episodeId);
        });
        this.pump();
    }

    shutdown(): void {
        this.handles.forEach((handle) => {
            handle.cancel();
        });
    }

    private isActiveJob(episodeId: number): boolean {
        const job = this.jobs.get(episodeId);
        return job !== undefined && isActive(job);
    }

    private queueEpisode(anime: AnimeRecord, episode: AnimeEpisodeRecord): void {
        if (episode.status === 'done' || this.isActiveJob(episode.id)) {
            return;
        }
        const job: AnimeJob = {
            episodeId: episode.id,
            animeId: anime.id,
            animeTitle: anime.title,
            episode: episode.number,
            status: 'queued',
            percent: 0,
            speed: '',
            eta: '',
            error: null
        };
        this.jobs.set(episode.id, job);
        this.deps.onJobUpdate({ ...job });
    }

    private update(job: AnimeJob, changes: Partial<AnimeJob>): void {
        Object.assign(job, changes);
        this.deps.onJobUpdate({ ...job });
    }

    private pump(): void {
        const limit = this.deps.getSettings().maxConcurrent;
        let running = this.handles.size;
        for (const job of this.jobs.values()) {
            if (running >= limit) {
                return;
            }
            if (job.status === 'queued' && !this.handles.has(job.episodeId) && this.launch(job)) {
                running += 1;
            }
        }
    }

    // Whether a download was started (it is not when the job has to end right away).
    private launch(job: AnimeJob): boolean {
        const { db } = this.deps;
        const anime = db.getAnime(job.animeId);
        if (!anime) {
            this.jobs.delete(job.episodeId);
            return false;
        }
        const settings = this.deps.getSettings();
        const platform = this.deps.platform ?? process.platform;
        const downloadDir = animeDownloadDirectory(animeBaseDirectory(settings, this.deps.defaultDownloadDir, platform), anime.title, platform);
        try {
            this.deps.ensureDirectory(downloadDir);
        } catch (error) {
            this.finishWithError(job, { code: 'UNKNOWN', raw: error instanceof Error ? error.message : String(error) });
            this.deps.onLibraryChanged();
            return false;
        }
        db.markDownloading(job.episodeId);
        this.lastReported.delete(job.episodeId);
        this.update(job, { status: 'running' });
        this.deps.onLibraryChanged();
        const handle = this.deps.download({
            query: anime.query,
            index: anime.searchIndex,
            episode: job.episode,
            quality: settings.animeQuality,
            audio: anime.audio,
            downloadDir,
            onProgress: (progress) => {
                this.reportProgress(job, progress);
            }
        });
        this.handles.set(job.episodeId, handle);
        void handle.result.then((result) => {
            this.handles.delete(job.episodeId);
            if (!this.jobs.has(job.episodeId)) {
                return;
            }
            if (result.status === 'cancelled') {
                db.markFailed(job.episodeId, 'cancelled', null);
                this.update(job, { status: 'cancelled', speed: '', eta: '' });
            } else if (result.status === 'error') {
                this.finishWithError(job, result.error);
            } else {
                this.finishDownloaded(job, result.value.filePath, downloadDir, anime.title, platform);
            }
            this.deps.onLibraryChanged();
            this.pump();
        });
        return true;
    }

    private reportProgress(job: AnimeJob, progress: AniDownloadProgress): void {
        const last = this.lastReported.get(job.episodeId) ?? 0;
        if (progress.percent < 100 && Math.abs(progress.percent - last) < MIN_PERCENT_STEP) {
            return;
        }
        this.lastReported.set(job.episodeId, progress.percent);
        this.update(job, { percent: progress.percent, speed: progress.speed ?? '', eta: progress.eta ?? '' });
    }

    private finishDownloaded(job: AnimeJob, filePath: string | null, downloadDir: string, title: string, platform: NodeJS.Platform): void {
        const path = filePath ?? (platform === 'win32' ? win32 : posix).join(downloadDir, animeFileName(title, job.episode));
        const size = this.deps.fileSize(path);
        if (size === null) {
            this.finishWithError(job, { code: 'UNKNOWN', raw: `The downloaded file was not found: ${path}` });
            return;
        }
        this.deps.db.markDone(job.episodeId, path, size);
        this.update(job, { status: 'done', percent: 100, speed: '', eta: '' });
    }

    private finishWithError(job: AnimeJob, error: AniError): void {
        this.deps.db.markFailed(job.episodeId, 'error', error);
        this.update(job, { status: 'error', speed: '', eta: '', error });
    }
}
