import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { IPC } from '@shared/constants';
import { registerHandlers } from './ipc/registerHandlers';
import { AppUpdateService } from './services/appUpdateService';
import { BinaryResolver } from './services/binaryResolver';
import { getElectronUpdater } from './services/electronUpdater';
import { ignoreStdioErrors } from './services/stdioGuard';
import { HistoryStore } from './services/historyStore';
import { QueueManager } from './services/queueManager';
import { SettingsStore } from './services/settingsStore';
import { runYtdlp } from './services/ytdlpRunner';

const STARTUP_UPDATE_CHECK_DELAY_MS = 5000;
const PRODUCTION_CSP =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'";

ignoreStdioErrors();

let mainWindow: BrowserWindow | null = null;

function applyContentSecurityPolicy(): void {
    if (process.env.ELECTRON_RENDERER_URL) {
        return;
    }
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [PRODUCTION_CSP] } });
    });
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
        icon: join(__dirname, '../../resources/icon.png'),
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

    app.on('before-quit', () => {
        queue.shutdown();
    });

    registerHandlers({
        ipcMain,
        settingsStore,
        historyStore,
        queue,
        resolver,
        appUpdates,
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

void app.whenReady().then(() => {
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
