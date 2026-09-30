import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '@shared/constants';
import type { AddJobResult, AppUpdateState, BinariesStatus, DownloadJob, HistoryEntry, Settings, TraySupport } from '@shared/types';

export type Tab = 'downloads' | 'history' | 'settings';
export type NoticeKind = 'error' | 'info';

export interface Notice {
    kind: NoticeKind;
    message: string;
}

export const INITIAL_APP_UPDATE: AppUpdateState = { status: 'idle', currentVersion: '', version: null, percent: 0, message: null };

export interface AppState {
    tab: Tab;
    jobs: DownloadJob[];
    history: HistoryEntry[];
    settings: Settings;
    binaries: BinariesStatus | null;
    notice: Notice | null;
    updating: boolean;
    appUpdate: AppUpdateState;
    traySupport: TraySupport | null;
    setTab: (tab: Tab) => void;
    setNotice: (notice: Notice | null) => void;
    init: () => Promise<() => void>;
    addUrls: (urls: string[]) => Promise<AddJobResult[]>;
    cancelJob: (id: string) => Promise<void>;
    retryJob: (id: string) => Promise<void>;
    removeJob: (id: string) => Promise<void>;
    clearFinished: () => Promise<void>;
    refreshHistory: () => Promise<void>;
    clearHistory: () => Promise<void>;
    saveSettings: (settings: Settings) => Promise<Settings>;
    refreshBinaries: () => Promise<void>;
    updateYtdlp: () => Promise<void>;
    chooseDirectory: () => Promise<string | null>;
    checkAppUpdate: () => Promise<void>;
    downloadAppUpdate: () => Promise<void>;
    installAppUpdate: () => Promise<void>;
    refreshTraySupport: () => Promise<void>;
}

export function upsertJob(jobs: DownloadJob[], job: DownloadJob): DownloadJob[] {
    const exists = jobs.some((candidate) => {
        return candidate.id === job.id;
    });
    if (!exists) {
        return [...jobs, job];
    }
    return jobs.map((candidate) => {
        return candidate.id === job.id ? job : candidate;
    });
}

export const useAppStore = create<AppState>((set, get) => {
    return {
        tab: 'downloads',
        jobs: [],
        history: [],
        settings: DEFAULT_SETTINGS,
        binaries: null,
        notice: null,
        updating: false,
        appUpdate: INITIAL_APP_UPDATE,
        traySupport: null,

        setTab: (tab) => {
            set({ tab });
        },

        setNotice: (notice) => {
            set({ notice });
        },

        init: async () => {
            const api = window.api;
            const [settings, jobs, history, binaries, appUpdate] = await Promise.all([
                api.getSettings(),
                api.listJobs(),
                api.listHistory(),
                api.checkBinaries(),
                api.getAppUpdateState()
            ]);
            set({ settings, jobs, history, binaries, appUpdate });
            const unsubscribers = [
                api.onJobUpdate((job) => {
                    set((state) => {
                        return { jobs: upsertJob(state.jobs, job) };
                    });
                }),
                api.onJobRemoved((id) => {
                    set((state) => {
                        return {
                            jobs: state.jobs.filter((job) => {
                                return job.id !== id;
                            })
                        };
                    });
                }),
                api.onHistoryChanged(() => {
                    void get().refreshHistory();
                }),
                api.onAppUpdateState((appUpdate) => {
                    set({ appUpdate });
                })
            ];
            return (): void => {
                unsubscribers.forEach((unsubscribe) => {
                    unsubscribe();
                });
            };
        },

        addUrls: (urls) => {
            return Promise.all(
                urls.map((url) => {
                    return window.api.addDownload(url);
                })
            );
        },

        cancelJob: async (id) => {
            await window.api.cancelJob(id);
        },

        retryJob: async (id) => {
            await window.api.retryJob(id);
        },

        removeJob: async (id) => {
            await window.api.removeJob(id);
        },

        clearFinished: async () => {
            await window.api.clearFinished();
        },

        refreshHistory: async () => {
            set({ history: await window.api.listHistory() });
        },

        clearHistory: async () => {
            await window.api.clearHistory();
            set({ history: [] });
        },

        saveSettings: async (settings) => {
            const previous = get().settings;
            const saved = await window.api.saveSettings(settings);
            set({ settings: saved });
            if (saved.ytdlpPath !== previous.ytdlpPath || saved.ffmpegPath !== previous.ffmpegPath) {
                await get().refreshBinaries();
            }
            return saved;
        },

        refreshBinaries: async () => {
            set({ binaries: await window.api.checkBinaries() });
        },

        updateYtdlp: async () => {
            set({ updating: true });
            const result = await window.api.updateYtdlp();
            set({
                updating: false,
                notice: { kind: result.ok ? 'info' : 'error', message: result.output || (result.ok ? 'yt-dlp is up to date.' : 'Update failed.') }
            });
            await get().refreshBinaries();
        },

        chooseDirectory: () => {
            return window.api.chooseDirectory();
        },

        checkAppUpdate: async () => {
            await window.api.checkAppUpdate();
        },

        downloadAppUpdate: async () => {
            await window.api.downloadAppUpdate();
        },

        installAppUpdate: async () => {
            await window.api.installAppUpdate();
        },

        refreshTraySupport: async () => {
            set({ traySupport: await window.api.getTraySupport() });
        }
    };
});
