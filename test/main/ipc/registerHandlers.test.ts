import { join } from 'node:path';
import { DEFAULT_SETTINGS, IPC } from '@shared/constants';
import type { DownloadJob, HistoryEntry } from '@shared/types';
import { registerHandlers, type IpcMainLike } from '@main/ipc/registerHandlers';
import { checkBinaries } from '@main/services/binaryLocator';
import { BinaryResolver } from '@main/services/binaryResolver';
import { updateYtdlp } from '@main/services/updater';
import { HistoryStore } from '@main/services/historyStore';
import type { AppUpdateService } from '@main/services/appUpdateService';
import type { QueueManager } from '@main/services/queueManager';
import type { StreamFinder } from '@main/services/streamFinder';
import { SettingsStore } from '@main/services/settingsStore';
import { cleanTempDirs, makeTempDir } from '../../helpers/tempDir';

vi.mock('@main/services/binaryLocator', () => {
    return {
        checkBinaries: vi.fn(async () => {
            return {
                ytdlp: { found: true, path: 'yt-dlp', version: '1', source: 'system' },
                ffmpeg: { found: false, path: 'ffmpeg', version: null, source: 'system' }
            };
        })
    };
});
vi.mock('@main/services/updater', () => {
    return {
        updateYtdlp: vi.fn(async () => {
            return { ok: true, output: 'updated' };
        })
    };
});

afterEach(() => {
    cleanTempDirs();
});

const JOB: DownloadJob = {
    id: 'j1', url: 'https://x.com/a', status: 'queued', title: null, percent: 0, speed: '', eta: '', filePath: null, error: null, createdAt: 1, pageUrl: null
};

function setup() {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const ipcMain: IpcMainLike = {
        handle: (channel, listener) => {
            handlers.set(channel, listener);
        }
    };
    const dir = makeTempDir();
    const settingsStore = new SettingsStore(join(dir, 's.json'));
    const historyStore = new HistoryStore(join(dir, 'h.json'));
    const queue = {
        add: vi.fn(() => {
            return { ok: true, job: JOB, message: null };
        }),
        list: vi.fn(() => {
            return [JOB];
        }),
        getJob: vi.fn(),
        cancel: vi.fn(),
        retry: vi.fn(),
        remove: vi.fn(),
        clearFinished: vi.fn()
    };
    const appUpdates = {
        getState: vi.fn(() => {
            return { status: 'idle', currentVersion: '0.1.0', version: null, percent: 0, message: null };
        }),
        check: vi.fn(async () => {
            return undefined;
        }),
        download: vi.fn(async () => {
            return undefined;
        }),
        install: vi.fn()
    };
    const chooseDirectory = vi.fn(async () => {
        return '/chosen';
    });
    const showItemInFolder = vi.fn();
    const refreshTraySupport = vi.fn(async () => {
        return { available: false, reason: 'no tray here' };
    });
    const onSettingsSaved = vi.fn();
    const sendStreamProgress = vi.fn();
    const streamFinder = {
        find: vi.fn<StreamFinder['find']>(async () => {
            return { ok: true, candidates: [], message: null, usedBrowser: false };
        }),
        cancel: vi.fn(),
        getCandidate: vi.fn()
    };
    const resolver = new BinaryResolver({ bundledDir: '/b', userBinDir: '/u' });
    registerHandlers({ ipcMain, settingsStore, historyStore, queue: queue as unknown as QueueManager, resolver, appUpdates: appUpdates as unknown as AppUpdateService, refreshTraySupport, onSettingsSaved, streamFinder: streamFinder as unknown as StreamFinder, sendStreamProgress, chooseDirectory, showItemInFolder });
    const call = (channel: string, ...args: unknown[]): unknown => {
        const handler = handlers.get(channel);
        if (!handler) {
            throw new Error(`no handler for ${channel}`);
        }
        return handler({}, ...args);
    };
    return { handlers, call, streamFinder, sendStreamProgress, refreshTraySupport, onSettingsSaved, appUpdates, resolver, settingsStore, historyStore, queue, chooseDirectory, showItemInFolder };
}

describe('registerHandlers', () => {
    it('registers every invoke channel', () => {
        const { handlers } = setup();
        expect([...handlers.keys()].sort()).toEqual(
            [
                IPC.settingsGet, IPC.settingsSave, IPC.queueAdd, IPC.queueList, IPC.queueCancel, IPC.queueRetry, IPC.queueRemove,
                IPC.queueClearFinished, IPC.historyList, IPC.historyClear, IPC.binariesCheck, IPC.ytdlpUpdate, IPC.appUpdateGet, IPC.appUpdateCheck, IPC.appUpdateDownload, IPC.appUpdateInstall, IPC.traySupport, IPC.streamFind, IPC.streamCancel, IPC.streamDownload, IPC.dialogChooseDir,
                IPC.shellShowItem
            ].sort()
        );
    });

    it('gets and saves sanitized settings', () => {
        const { call } = setup();
        expect(call(IPC.settingsGet)).toEqual(DEFAULT_SETTINGS);
        expect(call(IPC.settingsSave, { ...DEFAULT_SETTINGS, maxTitleLength: 5000 })).toEqual({ ...DEFAULT_SETTINGS, maxTitleLength: 200 });
        expect(call(IPC.settingsGet)).toEqual({ ...DEFAULT_SETTINGS, maxTitleLength: 200 });
    });

    it('notifies the app with the sanitized settings after saving', () => {
        const { call, onSettingsSaved } = setup();
        call(IPC.settingsSave, { ...DEFAULT_SETTINGS, closeToTray: true, maxTitleLength: 5000 });
        expect(onSettingsSaved).toHaveBeenCalledTimes(1);
        expect(onSettingsSaved).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, closeToTray: true, maxTitleLength: 200 });
    });

    it('does not notify on plain settings reads', () => {
        const { call, onSettingsSaved } = setup();
        call(IPC.settingsGet);
        expect(onSettingsSaved).not.toHaveBeenCalled();
    });

    it('returns a fresh tray support check', async () => {
        const { call, refreshTraySupport } = setup();
        await expect(call(IPC.traySupport)).resolves.toEqual({ available: false, reason: 'no tray here' });
        expect(refreshTraySupport).toHaveBeenCalledTimes(1);
    });

    describe('stream finder', () => {
        const TARGET = { id: 'j1', url: 'https://site.test/ep-1' };

        it('searches the page of an existing job and reports the stage to the screen', async () => {
            const { call, queue, streamFinder, sendStreamProgress } = setup();
            queue.getJob.mockReturnValue(TARGET);
            streamFinder.find.mockImplementationOnce(async (_jobId, _url, _deep, onStage) => {
                onStage('scanning');
                onStage('watching');
                return { ok: true, candidates: [], message: null, usedBrowser: true };
            });
            await expect(call(IPC.streamFind, 'j1', true)).resolves.toEqual({ ok: true, candidates: [], message: null, usedBrowser: true });
            expect(queue.getJob).toHaveBeenCalledWith('j1');
            expect(streamFinder.find).toHaveBeenCalledWith('j1', 'https://site.test/ep-1', true, expect.any(Function));
            expect(sendStreamProgress.mock.calls).toEqual([[{ jobId: 'j1', stage: 'scanning' }], [{ jobId: 'j1', stage: 'watching' }]]);
        });

        it('only searches deeper when asked with exactly true', async () => {
            const { call, queue, streamFinder } = setup();
            queue.getJob.mockReturnValue(TARGET);
            await call(IPC.streamFind, 'j1', 'yes');
            expect(streamFinder.find).toHaveBeenCalledWith('j1', TARGET.url, false, expect.any(Function));
        });

        it('searches again on the page a stream came from when the job has one', async () => {
            const { call, queue, streamFinder } = setup();
            queue.getJob.mockReturnValue({ id: 'j9', url: 'https://cdn.test/videoplayback?sig=old', pageUrl: 'https://site.test/ep-1' });
            await call(IPC.streamFind, 'j9', false);
            expect(streamFinder.find).toHaveBeenCalledWith('j9', 'https://site.test/ep-1', false, expect.any(Function));
        });

        it('refuses to search for a job that does not exist', () => {
            const { call, queue, streamFinder } = setup();
            queue.getJob.mockReturnValue(undefined);
            expect(call(IPC.streamFind, 'gone', false)).toEqual({ ok: false, candidates: [], message: 'That download no longer exists.', usedBrowser: false });
            expect(streamFinder.find).not.toHaveBeenCalled();
        });

        it('cancels a search by job id', () => {
            const { call, streamFinder } = setup();
            call(IPC.streamCancel, 'j1');
            call(IPC.streamCancel, 7);
            expect(streamFinder.cancel.mock.calls).toEqual([['j1'], ['']]);
        });

        it('downloads the chosen stream with the referer, user agent, cookie and title the finder kept', () => {
            const { call, queue, streamFinder } = setup();
            streamFinder.getCandidate.mockReturnValue({ url: 'https://cdn.test/a.m3u8', referer: 'https://site.test/ep-1', userAgent: 'UA', cookie: 'sid=1', title: 'Episode 1', ipFamily: null, pageUrl: 'https://site.test/ep-1' });
            expect(call(IPC.streamDownload, 'c1')).toEqual({ ok: true, job: JOB, message: null });
            expect(streamFinder.getCandidate).toHaveBeenCalledWith('c1');
            expect(queue.add).toHaveBeenCalledWith('https://cdn.test/a.m3u8', { referer: 'https://site.test/ep-1', userAgent: 'UA', cookie: 'sid=1', title: 'Episode 1', ipFamily: undefined, pageUrl: 'https://site.test/ep-1' });
        });

        it('leaves the cookie and title out when the stream has none', () => {
            const { call, queue, streamFinder } = setup();
            streamFinder.getCandidate.mockReturnValue({ url: 'https://cdn.test/a.mp4', referer: 'https://site.test/ep-1', userAgent: 'UA', cookie: null, title: null, ipFamily: 6, pageUrl: 'https://origin.test/p' });
            call(IPC.streamDownload, 'c2');
            expect(queue.add).toHaveBeenCalledWith('https://cdn.test/a.mp4', { referer: 'https://site.test/ep-1', userAgent: 'UA', cookie: undefined, title: undefined, ipFamily: 6, pageUrl: 'https://origin.test/p' });
        });

        it('explains when the stream is no longer known', () => {
            const { call, queue, streamFinder } = setup();
            streamFinder.getCandidate.mockReturnValue(undefined);
            expect(call(IPC.streamDownload, 'old')).toEqual({ ok: false, job: null, message: 'That stream is no longer available. Search again.' });
            expect(queue.add).not.toHaveBeenCalled();
        });
    });

    it('adds a download with the URL string', () => {
        const { call, queue } = setup();
        expect(call(IPC.queueAdd, 'https://x.com/a')).toEqual({ ok: true, job: JOB, message: null });
        expect(queue.add).toHaveBeenCalledWith('https://x.com/a');
    });

    it('coerces non-string URLs to an empty string', () => {
        const { call, queue } = setup();
        call(IPC.queueAdd, 42);
        expect(queue.add).toHaveBeenCalledWith('');
    });

    it('lists jobs', () => {
        expect(setup().call(IPC.queueList)).toEqual([JOB]);
    });

    it('forwards cancel, retry and remove with the id', () => {
        const { call, queue } = setup();
        call(IPC.queueCancel, 'j1');
        call(IPC.queueRetry, 'j2');
        call(IPC.queueRemove, 'j3');
        expect(queue.cancel).toHaveBeenCalledWith('j1');
        expect(queue.retry).toHaveBeenCalledWith('j2');
        expect(queue.remove).toHaveBeenCalledWith('j3');
    });

    it('clears finished jobs', () => {
        const { call, queue } = setup();
        call(IPC.queueClearFinished);
        expect(queue.clearFinished).toHaveBeenCalledTimes(1);
    });

    it('lists and clears history', () => {
        const { call, historyStore } = setup();
        const entry: HistoryEntry = { id: 'h', url: 'https://x.com', title: 't', filePath: null, status: 'done', errorTitle: null, finishedAt: 1 };
        historyStore.add(entry);
        expect(call(IPC.historyList)).toEqual([entry]);
        call(IPC.historyClear);
        expect(call(IPC.historyList)).toEqual([]);
    });

    it('checks binaries with the current settings and the resolver', async () => {
        const { call, resolver } = setup();
        await expect(call(IPC.binariesCheck)).resolves.toEqual({
            ytdlp: { found: true, path: 'yt-dlp', version: '1', source: 'system' },
            ffmpeg: { found: false, path: 'ffmpeg', version: null, source: 'system' }
        });
        expect(checkBinaries).toHaveBeenCalledWith(DEFAULT_SETTINGS, resolver);
    });

    it('updates yt-dlp with the current settings and the resolver', async () => {
        const { call, resolver } = setup();
        await expect(call(IPC.ytdlpUpdate)).resolves.toEqual({ ok: true, output: 'updated' });
        expect(updateYtdlp).toHaveBeenCalledWith(DEFAULT_SETTINGS, resolver);
    });

    it('exposes the app update state and actions', async () => {
        const { call, appUpdates } = setup();
        expect(call(IPC.appUpdateGet)).toEqual({ status: 'idle', currentVersion: '0.1.0', version: null, percent: 0, message: null });
        await call(IPC.appUpdateCheck);
        await call(IPC.appUpdateDownload);
        call(IPC.appUpdateInstall);
        expect(appUpdates.check).toHaveBeenCalledTimes(1);
        expect(appUpdates.download).toHaveBeenCalledTimes(1);
        expect(appUpdates.install).toHaveBeenCalledTimes(1);
    });

    it('opens the directory chooser', async () => {
        const { call, chooseDirectory } = setup();
        await expect(call(IPC.dialogChooseDir)).resolves.toBe('/chosen');
        expect(chooseDirectory).toHaveBeenCalledTimes(1);
    });

    it('shows an item in the folder only when the path is a non-empty string', () => {
        const { call, showItemInFolder } = setup();
        call(IPC.shellShowItem, '/dl/a.mp4');
        call(IPC.shellShowItem, '');
        call(IPC.shellShowItem, null);
        expect(showItemInFolder).toHaveBeenCalledTimes(1);
        expect(showItemInFolder).toHaveBeenCalledWith('/dl/a.mp4');
    });
});
