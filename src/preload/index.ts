import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC } from '@shared/constants';
import type { AppUpdateState, CyberApi, DownloadJob, StreamFindProgress } from '@shared/types';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
    const wrapped = (_event: IpcRendererEvent, payload: T): void => {
        listener(payload);
    };
    ipcRenderer.on(channel, wrapped);
    return (): void => {
        ipcRenderer.removeListener(channel, wrapped);
    };
}

const api: CyberApi = {
    getSettings: () => {
        return ipcRenderer.invoke(IPC.settingsGet);
    },
    saveSettings: (settings) => {
        return ipcRenderer.invoke(IPC.settingsSave, settings);
    },
    addDownload: (url, downloadDir) => {
        return ipcRenderer.invoke(IPC.queueAdd, url, downloadDir);
    },
    listJobs: () => {
        return ipcRenderer.invoke(IPC.queueList);
    },
    cancelJob: (id) => {
        return ipcRenderer.invoke(IPC.queueCancel, id);
    },
    stopJob: (id) => {
        return ipcRenderer.invoke(IPC.queueStop, id);
    },
    retryJob: (id) => {
        return ipcRenderer.invoke(IPC.queueRetry, id);
    },
    removeJob: (id) => {
        return ipcRenderer.invoke(IPC.queueRemove, id);
    },
    clearFinished: () => {
        return ipcRenderer.invoke(IPC.queueClearFinished);
    },
    listHistory: () => {
        return ipcRenderer.invoke(IPC.historyList);
    },
    clearHistory: () => {
        return ipcRenderer.invoke(IPC.historyClear);
    },
    checkBinaries: () => {
        return ipcRenderer.invoke(IPC.binariesCheck);
    },
    updateYtdlp: () => {
        return ipcRenderer.invoke(IPC.ytdlpUpdate);
    },
    getAppUpdateState: () => {
        return ipcRenderer.invoke(IPC.appUpdateGet);
    },
    checkAppUpdate: () => {
        return ipcRenderer.invoke(IPC.appUpdateCheck);
    },
    downloadAppUpdate: () => {
        return ipcRenderer.invoke(IPC.appUpdateDownload);
    },
    installAppUpdate: () => {
        return ipcRenderer.invoke(IPC.appUpdateInstall);
    },
    getTraySupport: () => {
        return ipcRenderer.invoke(IPC.traySupport);
    },
    findStreams: (jobId, deep) => {
        return ipcRenderer.invoke(IPC.streamFind, jobId, deep);
    },
    cancelStreamFind: (jobId) => {
        return ipcRenderer.invoke(IPC.streamCancel, jobId);
    },
    downloadStream: (candidateId) => {
        return ipcRenderer.invoke(IPC.streamDownload, candidateId);
    },
    chooseDirectory: () => {
        return ipcRenderer.invoke(IPC.dialogChooseDir);
    },
    showItemInFolder: (path) => {
        return ipcRenderer.invoke(IPC.shellShowItem, path);
    },
    onJobUpdate: (listener) => {
        return subscribe<DownloadJob>(IPC.eventJobUpdate, listener);
    },
    onJobRemoved: (listener) => {
        return subscribe<string>(IPC.eventJobRemoved, listener);
    },
    onAppUpdateState: (listener) => {
        return subscribe<AppUpdateState>(IPC.eventAppUpdateState, listener);
    },
    onStreamFindProgress: (listener) => {
        return subscribe<StreamFindProgress>(IPC.eventStreamProgress, listener);
    },
    onHistoryChanged: (listener) => {
        return subscribe<undefined>(IPC.eventHistoryChanged, () => {
            listener();
        });
    }
};

contextBridge.exposeInMainWorld('api', api);
