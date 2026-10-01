import { en } from '@shared/i18n/en';
import type { TraySupport } from '@shared/types';
import { TrayManager } from '@main/services/trayManager';

const AVAILABLE: TraySupport = { available: true, reason: null };
const UNAVAILABLE: TraySupport = { available: false, reason: 'no tray here' };

function setup(support: TraySupport = AVAILABLE) {
    const destroy = vi.fn();
    const createTray = vi.fn(() => {
        return { destroy };
    });
    const checkSupport = vi.fn(async () => {
        return support;
    });
    const manager = new TrayManager({ createTray, checkSupport });
    return { manager, createTray, checkSupport, destroy };
}

describe('TrayManager rebuild', () => {
    it('does nothing while there is no tray', async () => {
        const { manager, createTray, destroy } = setup();
        await manager.rebuild();
        expect(createTray).not.toHaveBeenCalled();
        expect(destroy).not.toHaveBeenCalled();
    });

    it('does nothing while the tray is disabled', async () => {
        const { manager, createTray, destroy } = setup();
        await manager.sync(false);
        await manager.rebuild();
        expect(createTray).not.toHaveBeenCalled();
        expect(destroy).not.toHaveBeenCalled();
    });

    it('replaces the existing tray so its menu gets the new language', async () => {
        const { manager, createTray, destroy } = setup();
        await manager.sync(true);
        await manager.rebuild();
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(createTray).toHaveBeenCalledTimes(2);
        expect(manager.canHideToTray()).toBe(true);
    });

    it('reports an unsupported tray when the new icon cannot be created', async () => {
        const { manager, createTray } = setup();
        await manager.sync(true);
        createTray.mockImplementationOnce(() => {
            throw new Error('boom');
        });
        await manager.rebuild();
        expect(manager.canHideToTray()).toBe(false);
        expect(manager.getSupport()).toEqual({ available: false, reason: en['tray.createFailed'] });
    });
});

describe('TrayManager', () => {
    it('starts disabled: no tray and no hiding', () => {
        const { manager, createTray } = setup();
        expect(manager.canHideToTray()).toBe(false);
        expect(createTray).not.toHaveBeenCalled();
    });

    it('creates the tray when enabled and supported', async () => {
        const { manager, createTray, checkSupport } = setup();
        await manager.sync(true);
        expect(checkSupport).toHaveBeenCalledTimes(1);
        expect(createTray).toHaveBeenCalledTimes(1);
        expect(manager.canHideToTray()).toBe(true);
        expect(manager.getSupport()).toEqual(AVAILABLE);
    });

    it('does not create a second tray when synced twice', async () => {
        const { manager, createTray } = setup();
        await manager.sync(true);
        await manager.sync(true);
        expect(createTray).toHaveBeenCalledTimes(1);
    });

    it('does not create the tray and cannot hide when the environment has no tray', async () => {
        const { manager, createTray } = setup(UNAVAILABLE);
        await manager.sync(true);
        expect(createTray).not.toHaveBeenCalled();
        expect(manager.canHideToTray()).toBe(false);
        expect(manager.getSupport()).toEqual(UNAVAILABLE);
    });

    it('destroys the tray when disabled', async () => {
        const { manager, destroy, checkSupport } = setup();
        await manager.sync(true);
        await manager.sync(false);
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(manager.canHideToTray()).toBe(false);
        expect(checkSupport).toHaveBeenCalledTimes(1);
    });

    it('can create the tray again after it was disabled', async () => {
        const { manager, createTray } = setup();
        await manager.sync(true);
        await manager.sync(false);
        await manager.sync(true);
        expect(createTray).toHaveBeenCalledTimes(2);
        expect(manager.canHideToTray()).toBe(true);
    });

    it('does nothing when disabled and there is no tray', async () => {
        const { manager, destroy } = setup();
        await manager.sync(false);
        expect(destroy).not.toHaveBeenCalled();
    });

    it('destroys an existing tray when support disappears', async () => {
        const supports: TraySupport[] = [AVAILABLE, UNAVAILABLE];
        const destroy = vi.fn();
        const manager = new TrayManager({
            createTray: () => {
                return { destroy };
            },
            checkSupport: async () => {
                return supports.shift() ?? UNAVAILABLE;
            }
        });
        await manager.sync(true);
        await manager.sync(true);
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(manager.canHideToTray()).toBe(false);
    });

    it('reports the failure and does not hide when the tray cannot be created', async () => {
        const manager = new TrayManager({
            createTray: () => {
                throw new Error('boom');
            },
            checkSupport: async () => {
                return AVAILABLE;
            }
        });
        await manager.sync(true);
        expect(manager.canHideToTray()).toBe(false);
        expect(manager.getSupport()).toEqual({ available: false, reason: en['tray.createFailed'] });
    });

    it('serializes overlapping syncs so the last request wins', async () => {
        const { manager, createTray, destroy } = setup();
        const first = manager.sync(true);
        const second = manager.sync(false);
        await Promise.all([first, second]);
        expect(createTray).toHaveBeenCalledTimes(1);
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(manager.canHideToTray()).toBe(false);
    });

    it('refreshSupport re-checks and returns a copy', async () => {
        const { manager, checkSupport } = setup(UNAVAILABLE);
        const result = await manager.refreshSupport();
        expect(checkSupport).toHaveBeenCalledTimes(1);
        expect(result).toEqual(UNAVAILABLE);
        result.available = true;
        expect(manager.getSupport()).toEqual(UNAVAILABLE);
    });
});
