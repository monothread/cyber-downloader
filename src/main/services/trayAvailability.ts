import type { TraySupport } from '@shared/types';
import { translateMain } from './language';
import { defaultExecFile, type ExecFileFn } from './binaryLocator';

export const WATCHER_NAME = 'org.kde.StatusNotifierWatcher';

export const WATCHER_CHECK_ARGS = [
    'call',
    '--session',
    '--dest',
    'org.freedesktop.DBus',
    '--object-path',
    '/org/freedesktop/DBus',
    '--method',
    'org.freedesktop.DBus.NameHasOwner',
    WATCHER_NAME
];

// Electron shows the tray icon through the StatusNotifierItem (SNI) D-Bus protocol, which is what KDE Plasma,
// Cinnamon, XFCE and the GNOME AppIndicator extension implement. Returns null when the check itself failed.
export async function hasStatusNotifierWatcher(exec: ExecFileFn = defaultExecFile): Promise<boolean | null> {
    try {
        const output = await exec('gdbus', WATCHER_CHECK_ARGS);
        return /true/.test(output);
    } catch {
        return null;
    }
}

export function isGnomeDesktop(desktop: string | undefined): boolean {
    return (desktop ?? '')
        .toLowerCase()
        .split(':')
        .includes('gnome');
}

// Stock GNOME has no tray at all: hiding the window there would leave the app unreachable, so it is only
// considered available when the SNI watcher is running. Every other desktop (KDE, XFCE, Cinnamon, MATE,
// LXQt, ...) ships a tray, so it is assumed to work even when the watcher check is inconclusive.
export async function checkTraySupport(
    env: NodeJS.ProcessEnv = process.env,
    exec: ExecFileFn = defaultExecFile,
    platform: NodeJS.Platform = process.platform
): Promise<TraySupport> {
    // Windows (and macOS) always provide a notification area; the D-Bus check is Linux-only.
    if (platform !== 'linux') {
        return { available: true, reason: null };
    }
    const watcher = await hasStatusNotifierWatcher(exec);
    if (watcher === true) {
        return { available: true, reason: null };
    }
    if (isGnomeDesktop(env.XDG_CURRENT_DESKTOP)) {
        return { available: false, reason: translateMain('tray.noTray') };
    }
    return { available: true, reason: null };
}
