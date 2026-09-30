import { IPC } from '@shared/constants';
import type { AppUpdateState, BinariesStatus, HistoryEntry, Settings, TraySupport, UpdateResult } from '@shared/types';
import { checkBinaries } from '../services/binaryLocator';
import type { BinaryResolver } from '../services/binaryResolver';
import { updateYtdlp } from '../services/updater';
import type { AppUpdateService } from '../services/appUpdateService';
import type { HistoryStore } from '../services/historyStore';
import type { QueueManager } from '../services/queueManager';
import type { SettingsStore } from '../services/settingsStore';

export interface IpcMainLike {
    handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void;
}

export interface HandlerDependencies {
    ipcMain: IpcMainLike;
    settingsStore: SettingsStore;
    historyStore: HistoryStore;
    queue: QueueManager;
    resolver: BinaryResolver;
    appUpdates: AppUpdateService;
    refreshTraySupport: () => Promise<TraySupport>;
    onSettingsSaved: (settings: Settings) => void;
    chooseDirectory: () => Promise<string | null>;
    showItemInFolder: (path: string) => void;
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

export function registerHandlers(deps: HandlerDependencies): void {
    const { ipcMain, settingsStore, historyStore, queue } = deps;

    ipcMain.handle(IPC.settingsGet, (): Settings => {
        return settingsStore.get();
    });
    ipcMain.handle(IPC.settingsSave, (_event, input): Settings => {
        const saved = settingsStore.save(input);
        deps.onSettingsSaved(saved);
        return saved;
    });
    ipcMain.handle(IPC.queueAdd, (_event, url) => {
        return queue.add(asString(url));
    });
    ipcMain.handle(IPC.queueList, () => {
        return queue.list();
    });
    ipcMain.handle(IPC.queueCancel, (_event, id): void => {
        queue.cancel(asString(id));
    });
    ipcMain.handle(IPC.queueRetry, (_event, id): void => {
        queue.retry(asString(id));
    });
    ipcMain.handle(IPC.queueRemove, (_event, id): void => {
        queue.remove(asString(id));
    });
    ipcMain.handle(IPC.queueClearFinished, (): void => {
        queue.clearFinished();
    });
    ipcMain.handle(IPC.historyList, (): HistoryEntry[] => {
        return historyStore.list();
    });
    ipcMain.handle(IPC.historyClear, (): void => {
        historyStore.clear();
    });
    ipcMain.handle(IPC.binariesCheck, (): Promise<BinariesStatus> => {
        return checkBinaries(settingsStore.get(), deps.resolver);
    });
    ipcMain.handle(IPC.ytdlpUpdate, (): Promise<UpdateResult> => {
        return updateYtdlp(settingsStore.get(), deps.resolver);
    });
    ipcMain.handle(IPC.appUpdateGet, (): AppUpdateState => {
        return deps.appUpdates.getState();
    });
    ipcMain.handle(IPC.appUpdateCheck, (): Promise<void> => {
        return deps.appUpdates.check();
    });
    ipcMain.handle(IPC.appUpdateDownload, (): Promise<void> => {
        return deps.appUpdates.download();
    });
    ipcMain.handle(IPC.appUpdateInstall, (): void => {
        deps.appUpdates.install();
    });
    ipcMain.handle(IPC.traySupport, (): Promise<TraySupport> => {
        return deps.refreshTraySupport();
    });
    ipcMain.handle(IPC.dialogChooseDir, (): Promise<string | null> => {
        return deps.chooseDirectory();
    });
    ipcMain.handle(IPC.shellShowItem, (_event, path): void => {
        const target = asString(path);
        if (target.length > 0) {
            deps.showItemInFolder(target);
        }
    });
}
