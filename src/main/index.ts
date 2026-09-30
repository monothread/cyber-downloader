import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { IPC } from '@shared/constants';
import { registerHandlers } from './ipc/registerHandlers';
import { AppUpdateService } from './services/appUpdateService';
import { BinaryResolver } from './services/binaryResolver';
import { sniffStreams } from './services/browserSniffer';
import { createElectronTray } from './services/electronTray';
import { getElectronUpdater } from './services/electronUpdater';
import { HistoryStore } from './services/historyStore';
import { QueueManager } from './services/queueManager';
import { SettingsStore } from './services/settingsStore';
import { defaultFetchPage, scanPage } from './services/pageScanner';
import { defaultFetchPlaylist, dropVariantPlaylists } from './services/playlistFilter';
import { StreamFinder } from './services/streamFinder';
import { ignoreStdioErrors } from './services/stdioGuard';
import { checkTraySupport } from './services/trayAvailability';
import { TrayManager } from './services/trayManager';
import { createQuitRequester, decideCloseAction, describePending } from './services/windowClose';
import { runYtdlp } from './services/ytdlpRunner';

const APP_ID = 'dev.lucas.cyberdownloader';
const STARTUP_UPDATE_CHECK_DELAY_MS = 5000;
const PRODUCTION_CSP =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";

ignoreStdioErrors();

let mainWindow: BrowserWindow | null = null;
let trayManager: TrayManager | null = null;
let requestQuit: (() => Promise<boolean>) | null = null;
let quitting = false;

function iconPath(): string {
    return join(app.getAppPath(), 'resources', 'icon.png');
}

function applyContentSecurityPolicy(): void {
    if (process.env.ELECTRON_RENDERER_URL) {
        return;
    }
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [PRODUCTION_CSP] } });
    });
}

function showWindow(): void {
    if (!mainWindow || mainWindow.isDestroyed()) {
        return;
    }
    if (mainWindow.isMinimized()) {
        mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
}

function toggleWindow(): void {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide();
        return;
    }
    showWindow();
}

function handleWindowClose(event: Electron.Event): void {
    const action = decideCloseAction({ quitting, canHideToTray: trayManager?.canHideToTray() ?? false });
    if (action === 'allow') {
        return;
    }
    event.preventDefault();
    if (action === 'hide') {
        mainWindow?.hide();
        return;
    }
    void requestQuit?.();
}

function createWindow(): BrowserWindow {
    const window = new BrowserWindow({
        width: 1100,
        height: 780,
        minWidth: 820,
        minHeight: 600,
        backgroundColor: '#07060f',
        title: 'CYBER//DL',
        autoHideMenuBar: true,
        icon: iconPath(),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    });
    window.webContents.setWindowOpenHandler(() => {
        return { action: 'deny' };
    });
    window.on('close', handleWindowClose);
    if (process.env.ELECTRON_RENDERER_URL) {
        void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        void window.loadFile(join(__dirname, '../renderer/index.html'));
    }
    return window;
}

function sendToRenderer(channel: string, payload?: unknown): void {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, payload);
    }
}

async function confirmQuit(pending: number): Promise<boolean> {
    const options: Electron.MessageBoxOptions = {
        type: 'warning',
        buttons: ['Quit', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Quit Cyber Downloader?',
        message: describePending(pending),
        detail: 'Quitting now will cancel them.'
    };
    const result = mainWindow && !mainWindow.isDestroyed() ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
    return result.response === 0;
}

function scheduleStartupUpdateCheck(appUpdates: AppUpdateService, enabled: boolean): void {
    if (!app.isPackaged || !enabled) {
        return;
    }
    setTimeout(() => {
        void appUpdates.check();
    }, STARTUP_UPDATE_CHECK_DELAY_MS);
}

function bootstrap(): void {
    const dataDir = app.getPath('userData');
    const settingsStore = new SettingsStore(join(dataDir, 'settings.json'));
    const historyStore = new HistoryStore(join(dataDir, 'history.json'));
    const resolver = new BinaryResolver({
        bundledDir: app.isPackaged ? join(process.resourcesPath, 'bin') : join(app.getAppPath(), 'resources', 'bin'),
        userBinDir: join(dataDir, 'bin')
    });
    const queue = new QueueManager({
        getSettings: () => {
            return settingsStore.get();
        },
        defaultDownloadDir: app.getPath('downloads'),
        resolveYtdlpPath: (settings) => {
            return resolver.ytdlp(settings).path;
        },
        resolveFfmpegLocation: (settings) => {
            return resolver.ffmpegLocation(settings);
        },
        startRun: (binary, args, onProgress) => {
            return runYtdlp({ binary, args, onProgress, env: resolver.spawnEnv() });
        },
        addHistory: (entry) => {
            historyStore.add(entry);
        },
        onJobUpdate: (job) => {
            sendToRenderer(IPC.eventJobUpdate, job);
        },
        onJobRemoved: (id) => {
            sendToRenderer(IPC.eventJobRemoved, id);
        },
        onHistoryChanged: () => {
            sendToRenderer(IPC.eventHistoryChanged);
        }
    });
    const appUpdates = new AppUpdateService(
        getElectronUpdater(),
        { supported: app.isPackaged, currentVersion: app.getVersion() },
        (state) => {
            sendToRenderer(IPC.eventAppUpdateState, state);
        }
    );
    scheduleStartupUpdateCheck(appUpdates, settingsStore.get().checkUpdatesOnStart);

    requestQuit = createQuitRequester({
        pendingCount: () => {
            return queue.pendingCount();
        },
        confirm: confirmQuit,
        quit: () => {
            app.quit();
        }
    });
    const manager = new TrayManager({
        checkSupport: () => {
            return checkTraySupport();
        },
        createTray: () => {
            return createElectronTray(iconPath(), {
                show: showWindow,
                toggle: toggleWindow,
                quit: () => {
                    if (queue.pendingCount() > 0) {
                        showWindow();
                    }
                    void requestQuit?.();
                }
            });
        }
    });
    const streamFinder = new StreamFinder({
        scan: (url, signal) => {
            return scanPage(url, { fetchPage: defaultFetchPage }, signal);
        },
        sniff: sniffStreams,
        refine: (streams) => {
            return dropVariantPlaylists(streams, defaultFetchPlaylist);
        }
    });
    trayManager = manager;
    void manager.sync(settingsStore.get().closeToTray);

    app.on('before-quit', () => {
        quitting = true;
        queue.shutdown();
    });

    registerHandlers({
        ipcMain,
        settingsStore,
        historyStore,
        queue,
        resolver,
        appUpdates,
        refreshTraySupport: () => {
            return manager.refreshSupport();
        },
        streamFinder,
        sendStreamProgress: (progress) => {
            sendToRenderer(IPC.eventStreamProgress, progress);
        },
        onSettingsSaved: (settings) => {
            void manager.sync(settings.closeToTray);
        },
        chooseDirectory: async () => {
            const options = { properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'> };
            const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
            return result.canceled ? null : (result.filePaths[0] ?? null);
        },
        showItemInFolder: (path) => {
            shell.showItemInFolder(path);
        }
    });
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        showWindow();
    });

    void app.whenReady().then(() => {
        if (process.platform === 'win32') {
            app.setAppUserModelId(APP_ID);
        }
        applyContentSecurityPolicy();
        bootstrap();
        mainWindow = createWindow();
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                mainWindow = createWindow();
            }
        });
    });

    app.on('window-all-closed', () => {
        app.quit();
    });
}
