import { en } from '@shared/i18n/en';
import {
    WATCHER_CHECK_ARGS,
    WATCHER_NAME,
    checkTraySupport,
    hasStatusNotifierWatcher,
    isGnomeDesktop
} from '@main/services/trayAvailability';

const NO_TRAY_MESSAGE = en['tray.noTray'];

describe('hasStatusNotifierWatcher', () => {
    it('asks the session bus whether the StatusNotifierWatcher name has an owner', async () => {
        const exec = vi.fn(async () => {
            return '(true,)\n';
        });
        await hasStatusNotifierWatcher(exec);
        expect(exec).toHaveBeenCalledWith('gdbus', WATCHER_CHECK_ARGS);
        expect(WATCHER_CHECK_ARGS).toEqual([
            'call',
            '--session',
            '--dest',
            'org.freedesktop.DBus',
            '--object-path',
            '/org/freedesktop/DBus',
            '--method',
            'org.freedesktop.DBus.NameHasOwner',
            WATCHER_NAME
        ]);
        expect(WATCHER_NAME).toBe('org.kde.StatusNotifierWatcher');
    });

    it('returns true when the watcher is running', async () => {
        await expect(
            hasStatusNotifierWatcher(async () => {
                return '(true,)\n';
            })
        ).resolves.toBe(true);
    });

    it('returns false when nobody owns the name', async () => {
        await expect(
            hasStatusNotifierWatcher(async () => {
                return '(false,)\n';
            })
        ).resolves.toBe(false);
    });

    it('returns null when gdbus cannot be run', async () => {
        await expect(
            hasStatusNotifierWatcher(async () => {
                throw new Error('spawn gdbus ENOENT');
            })
        ).resolves.toBeNull();
    });
});

describe('isGnomeDesktop', () => {
    it.each(['GNOME', 'ubuntu:GNOME', 'GNOME-Classic:GNOME', 'pop:GNOME', 'gnome'])('detects %s', (desktop) => {
        expect(isGnomeDesktop(desktop)).toBe(true);
    });

    it.each(['KDE', 'XFCE', 'X-Cinnamon', 'MATE', 'LXQt', 'Budgie:GNOME-Flashback-not', '', undefined])('does not detect %s', (desktop) => {
        expect(isGnomeDesktop(desktop)).toBe(false);
    });
});

describe('checkTraySupport', () => {
    const running = async (): Promise<string> => {
        return '(true,)';
    };
    const absent = async (): Promise<string> => {
        return '(false,)';
    };
    const broken = async (): Promise<string> => {
        throw new Error('no gdbus');
    };

    it.each(['GNOME', 'KDE', 'XFCE', 'X-Cinnamon', 'ubuntu:GNOME'])('is available on %s when the watcher is running', async (desktop) => {
        await expect(checkTraySupport({ XDG_CURRENT_DESKTOP: desktop }, running)).resolves.toEqual({ available: true, reason: null });
    });

    it.each(['GNOME', 'ubuntu:GNOME', 'GNOME-Classic:GNOME'])('is unavailable on %s without the watcher', async (desktop) => {
        await expect(checkTraySupport({ XDG_CURRENT_DESKTOP: desktop }, absent)).resolves.toEqual({ available: false, reason: NO_TRAY_MESSAGE });
    });

    it('is unavailable on GNOME when the check itself fails', async () => {
        await expect(checkTraySupport({ XDG_CURRENT_DESKTOP: 'GNOME' }, broken)).resolves.toEqual({ available: false, reason: NO_TRAY_MESSAGE });
    });

    it.each(['KDE', 'XFCE', 'X-Cinnamon', 'MATE', 'LXQt'])('assumes a tray exists on %s even without the watcher', async (desktop) => {
        await expect(checkTraySupport({ XDG_CURRENT_DESKTOP: desktop }, absent)).resolves.toEqual({ available: true, reason: null });
        await expect(checkTraySupport({ XDG_CURRENT_DESKTOP: desktop }, broken)).resolves.toEqual({ available: true, reason: null });
    });

    it('assumes a tray exists when the desktop is unknown', async () => {
        await expect(checkTraySupport({}, absent)).resolves.toEqual({ available: true, reason: null });
    });

    it('mentions the GNOME extension in the message', () => {
        expect(NO_TRAY_MESSAGE).toContain('AppIndicator and KStatusNotifierItem Support');
        expect(NO_TRAY_MESSAGE).toContain('closing the window quits the app');
    });
});

describe('checkTraySupport on other platforms', () => {
    it.each(['win32', 'darwin'] as const)('is always available on %s without running gdbus', async (platform) => {
        const exec = vi.fn(async () => {
            return '(false,)';
        });
        await expect(checkTraySupport({ XDG_CURRENT_DESKTOP: 'GNOME' }, exec, platform)).resolves.toEqual({ available: true, reason: null });
        expect(exec).not.toHaveBeenCalled();
    });

    it('still runs the D-Bus check on Linux', async () => {
        const exec = vi.fn(async () => {
            return '(false,)';
        });
        await checkTraySupport({ XDG_CURRENT_DESKTOP: 'GNOME' }, exec, 'linux');
        expect(exec).toHaveBeenCalledWith('gdbus', WATCHER_CHECK_ARGS);
    });
});

