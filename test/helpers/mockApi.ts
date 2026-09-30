import { DEFAULT_SETTINGS } from '@shared/constants';
import type { AppUpdateState, CyberApi, DownloadJob } from '@shared/types';

export interface MockApiHandle {
    api: { [K in keyof CyberApi]: ReturnType<typeof vi.fn> };
    emitJobUpdate: (job: DownloadJob) => void;
    emitJobRemoved: (id: string) => void;
    emitHistoryChanged: () => void;
    emitAppUpdateState: (state: AppUpdateState) => void;
    unsubscribers: Array<ReturnType<typeof vi.fn>>;
}

export const APP_UPDATE_IDLE: AppUpdateState = { status: 'idle', currentVersion: '0.1.0', version: null, percent: 0, message: null };

export function createMockApi(): MockApiHandle {
    const jobListeners: Array<(job: DownloadJob) => void> = [];
    const removedListeners: Array<(id: string) => void> = [];
    const historyListeners: Array<() => void> = [];
    const appUpdateListeners: Array<(state: AppUpdateState) => void> = [];
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
        retryJob: vi.fn(async () => {
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
        chooseDirectory: vi.fn(async () => {
            return null;
        }),
        showItemInFolder: vi.fn(async () => {
            return undefined;
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
        ...overrides
    };
}
