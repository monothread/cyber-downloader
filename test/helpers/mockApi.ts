import { DEFAULT_SETTINGS } from '@shared/constants';
import type { AnimeImportResponse, AnimeJob, AnimeSubtitleImportResponse, AnimeSubtitleTrack, LibraryAnime } from '@shared/anime';
import type { AppUpdateState, CyberApi, DownloadJob, StreamFindProgress } from '@shared/types';

export interface MockApiHandle {
    api: { [K in keyof CyberApi]: ReturnType<typeof vi.fn> };
    emitJobUpdate: (job: DownloadJob) => void;
    emitJobRemoved: (id: string) => void;
    emitHistoryChanged: () => void;
    emitAppUpdateState: (state: AppUpdateState) => void;
    emitStreamProgress: (progress: StreamFindProgress) => void;
    emitAnimeJob: (job: AnimeJob) => void;
    emitAnimeLibraryChanged: () => void;
    unsubscribers: Array<ReturnType<typeof vi.fn>>;
}

export const APP_UPDATE_IDLE: AppUpdateState = { status: 'idle', currentVersion: '0.1.0', version: null, percent: 0, message: null };

export function createMockApi(): MockApiHandle {
    const jobListeners: Array<(job: DownloadJob) => void> = [];
    const removedListeners: Array<(id: string) => void> = [];
    const historyListeners: Array<() => void> = [];
    const appUpdateListeners: Array<(state: AppUpdateState) => void> = [];
    const streamProgressListeners: Array<(progress: StreamFindProgress) => void> = [];
    const animeJobListeners: Array<(job: AnimeJob) => void> = [];
    const animeLibraryListeners: Array<() => void> = [];
    const unsubscribers: Array<ReturnType<typeof vi.fn>> = [];

    function subscribe<T>(listeners: T[], listener: T): () => void {
        listeners.push(listener);
        const unsubscribe = vi.fn();
        unsubscribers.push(unsubscribe);
        return unsubscribe;
    }

    const api: MockApiHandle['api'] = {
        getSettings: vi.fn(async () => {
            return DEFAULT_SETTINGS;
        }),
        saveSettings: vi.fn(async (settings) => {
            return settings;
        }),
        addDownload: vi.fn(async () => {
            return { ok: true, job: null, message: null };
        }),
        listJobs: vi.fn(async () => {
            return [];
        }),
        cancelJob: vi.fn(async () => {
            return undefined;
        }),
        stopJob: vi.fn(async () => {
            return undefined;
        }),
        retryJob: vi.fn(async () => {
            return undefined;
        }),
        clearPartialFiles: vi.fn(async () => {
            return undefined;
        }),
        removeJob: vi.fn(async () => {
            return undefined;
        }),
        clearFinished: vi.fn(async () => {
            return undefined;
        }),
        listHistory: vi.fn(async () => {
            return [];
        }),
        clearHistory: vi.fn(async () => {
            return undefined;
        }),
        checkBinaries: vi.fn(async () => {
            return {
                ytdlp: { found: true, path: '/app/bin/yt-dlp', version: '2026.08.19', source: 'bundled' },
                ffmpeg: { found: true, path: '/app/bin/ffmpeg', version: '7.0', source: 'bundled' }
            };
        }),
        updateYtdlp: vi.fn(async () => {
            return { ok: true, output: 'Updated' };
        }),
        getAppUpdateState: vi.fn(async () => {
            return APP_UPDATE_IDLE;
        }),
        checkAppUpdate: vi.fn(async () => {
            return undefined;
        }),
        downloadAppUpdate: vi.fn(async () => {
            return undefined;
        }),
        installAppUpdate: vi.fn(async () => {
            return undefined;
        }),
        findStreams: vi.fn(async () => {
            return { ok: false, candidates: [], message: 'No video stream was found.', usedBrowser: true };
        }),
        cancelStreamFind: vi.fn(async () => {
            return undefined;
        }),
        downloadStream: vi.fn(async () => {
            return { ok: true, job: null, message: null };
        }),
        getTraySupport: vi.fn(async () => {
            return { available: true, reason: null };
        }),
        listBrowsers: vi.fn(async () => {
            return [];
        }),
        chooseDirectory: vi.fn(async () => {
            return null;
        }),
        showItemInFolder: vi.fn(async () => {
            return undefined;
        }),
        getAnimeStatus: vi.fn(async () => {
            return { supported: false, available: false, aniCli: null };
        }),
        searchAnime: vi.fn(async () => {
            return { ok: true, results: [] };
        }),
        listAnimeEpisodes: vi.fn(async () => {
            return { ok: true, episodes: [] };
        }),
        downloadAnime: vi.fn(async (): Promise<{ ok: false; message: string }> => {
            return { ok: false, message: 'not mocked' };
        }),
        listAnimeLibrary: vi.fn(async (): Promise<LibraryAnime[]> => {
            return [];
        }),
        listAnimeJobs: vi.fn(async (): Promise<AnimeJob[]> => {
            return [];
        }),
        cancelAnimeJob: vi.fn(async () => {
            return undefined;
        }),
        retryAnimeJob: vi.fn(async () => {
            return undefined;
        }),
        clearFinishedAnimeJobs: vi.fn(async () => {
            return undefined;
        }),
        removeAnimeEpisode: vi.fn(async () => {
            return undefined;
        }),
        removeAnime: vi.fn(async () => {
            return undefined;
        }),
        openAnimeFolder: vi.fn(async () => {
            return undefined;
        }),
        importAnimeLibrary: vi.fn(async (): Promise<AnimeImportResponse> => {
            return { ok: false, reason: 'cancelled' };
        }),
        saveAnimeProgress: vi.fn(async () => {
            return undefined;
        }),
        listAnimeSubtitles: vi.fn(async (): Promise<AnimeSubtitleTrack[]> => {
            return [];
        }),
        importAnimeSubtitle: vi.fn(async (): Promise<AnimeSubtitleImportResponse> => {
            return { ok: false, reason: 'cancelled' };
        }),
        updateAniCli: vi.fn(async () => {
            return { ok: true, output: 'Updated ani-cli' };
        }),
        openAnimeStream: vi.fn(async (): Promise<{ ok: true; stream: { sessionId: string; url: string; subtitleUrl: string | null } }> => {
            return { ok: true, stream: { sessionId: 's1', url: 'pullwave-stream://p/s1/abc', subtitleUrl: null } };
        }),
        closeAnimeStream: vi.fn(async () => {
            return undefined;
        }),
        onAnimeJobUpdate: vi.fn((listener: (job: AnimeJob) => void) => {
            return subscribe(animeJobListeners, listener);
        }),
        onAnimeLibraryChanged: vi.fn((listener: () => void) => {
            return subscribe(animeLibraryListeners, listener);
        }),
        onJobUpdate: vi.fn((listener: (job: DownloadJob) => void) => {
            return subscribe(jobListeners, listener);
        }),
        onJobRemoved: vi.fn((listener: (id: string) => void) => {
            return subscribe(removedListeners, listener);
        }),
        onAppUpdateState: vi.fn((listener: (state: AppUpdateState) => void) => {
            return subscribe(appUpdateListeners, listener);
        }),
        onStreamFindProgress: vi.fn((listener: (progress: StreamFindProgress) => void) => {
            return subscribe(streamProgressListeners, listener);
        }),
        onHistoryChanged: vi.fn((listener: () => void) => {
            return subscribe(historyListeners, listener);
        })
    };

    return {
        api,
        unsubscribers,
        emitJobUpdate: (job) => {
            jobListeners.forEach((listener) => {
                listener(job);
            });
        },
        emitJobRemoved: (id) => {
            removedListeners.forEach((listener) => {
                listener(id);
            });
        },
        emitStreamProgress: (progress) => {
            streamProgressListeners.forEach((listener) => {
                listener(progress);
            });
        },
        emitAnimeJob: (job) => {
            animeJobListeners.forEach((listener) => {
                listener(job);
            });
        },
        emitAnimeLibraryChanged: () => {
            animeLibraryListeners.forEach((listener) => {
                listener();
            });
        },
        emitAppUpdateState: (state) => {
            appUpdateListeners.forEach((listener) => {
                listener(state);
            });
        },
        emitHistoryChanged: () => {
            historyListeners.forEach((listener) => {
                listener();
            });
        }
    };
}

export function installMockApi(): MockApiHandle {
    const handle = createMockApi();
    Object.defineProperty(window, 'api', { value: handle.api, configurable: true, writable: true });
    return handle;
}

export function makeJob(overrides: Partial<DownloadJob> = {}): DownloadJob {
    return {
        id: 'job-1',
        url: 'https://example.com/v',
        status: 'running',
        title: 'Some Video',
        percent: 42.5,
        speed: '1.5MiB/s',
        eta: '00:10',
        filePath: null,
        error: null,
        createdAt: 1,
        pageUrl: null,
        live: false,
        elapsedSeconds: 0,
        downloadedBytes: 0,
        hasPartial: false,
        customized: false,
        waitingForLive: false,
        endCheck: null,
        merging: false,
        saving: false,
        postProcess: null,
        ...overrides
    };
}
