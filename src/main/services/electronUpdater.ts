import { autoUpdater } from 'electron-updater';
import type { UpdaterLike } from './appUpdateService';

export function getElectronUpdater(): UpdaterLike {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.logger = null;
    return autoUpdater as unknown as UpdaterLike;
}
