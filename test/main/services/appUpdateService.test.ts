import { EventEmitter } from 'node:events';
import type { Mock } from 'vitest';
import type { AppUpdateState } from '@shared/types';
import {
    AppUpdateService,
    UNSUPPORTED_MESSAGE,
    type UpdaterEvents,
    type UpdaterLike
} from '@main/services/appUpdateService';

interface FakeUpdater extends UpdaterLike {
    emitter: EventEmitter;
    checkForUpdates: Mock<() => Promise<unknown>>;
    downloadUpdate: Mock<() => Promise<unknown>>;
    quitAndInstall: Mock<(isSilent?: boolean, isForceRunAfter?: boolean) => void>;
}

function makeUpdater(): FakeUpdater {
    const emitter = new EventEmitter();
    return {
        emitter,
        on: <K extends keyof UpdaterEvents>(event: K, listener: UpdaterEvents[K]) => {
            emitter.on(event, listener);
            return emitter;
        },
        checkForUpdates: vi.fn(async () => {
            return null;
        }),
        downloadUpdate: vi.fn(async () => {
            return null;
        }),
        quitAndInstall: vi.fn()
    };
}

function setup(supported = true) {
    const updater = makeUpdater();
    const states: AppUpdateState[] = [];
    const service = new AppUpdateService(updater, { supported, currentVersion: '0.1.0' }, (state) => {
        states.push(state);
    });
    return { updater, service, states };
}

const IDLE: AppUpdateState = { status: 'idle', currentVersion: '0.1.0', version: null, percent: 0, message: null };

describe('AppUpdateService initial state', () => {
    it('starts idle with the current version', () => {
        expect(setup().service.getState()).toEqual(IDLE);
    });

    it('returns copies of the state', () => {
        const { service } = setup();
        const snapshot = service.getState();
        snapshot.percent = 99;
        expect(service.getState().percent).toBe(0);
    });
});

describe('AppUpdateService.check', () => {
    it('reports unsupported without touching the updater when not supported', async () => {
        const { service, updater, states } = setup(false);
        await service.check();
        expect(updater.checkForUpdates).not.toHaveBeenCalled();
        expect(service.getState()).toEqual({ ...IDLE, status: 'unsupported', message: UNSUPPORTED_MESSAGE });
        expect(states).toHaveLength(1);
    });

    it('moves to checking and calls the updater', async () => {
        const { service, updater, states } = setup();
        await service.check();
        expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
        expect(states[0]).toEqual({ ...IDLE, status: 'checking' });
    });

    it('does not start a second check while checking or downloading', async () => {
        const { service, updater } = setup();
        await service.check();
        await service.check();
        expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
        updater.emitter.emit('update-available', { version: '0.2.0' });
        await service.download();
        await service.check();
        expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    it('reports an error when the check rejects', async () => {
        const { service, updater } = setup();
        updater.checkForUpdates.mockRejectedValueOnce(new Error('offline'));
        await service.check();
        expect(service.getState()).toEqual({ ...IDLE, status: 'error', message: 'offline' });
    });

    it('uses a generic message for non-Error rejections', async () => {
        const { service, updater } = setup();
        updater.checkForUpdates.mockRejectedValueOnce('boom');
        await service.check();
        expect(service.getState().message).toBe('Update failed.');
    });

    it('can check again after finishing', async () => {
        const { service, updater } = setup();
        await service.check();
        updater.emitter.emit('update-not-available', { version: '0.1.0' });
        await service.check();
        expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    });
});

describe('AppUpdateService events', () => {
    it('handles an available update', () => {
        const { service, updater } = setup();
        updater.emitter.emit('update-available', { version: '0.2.0' });
        expect(service.getState()).toEqual({ ...IDLE, status: 'available', version: '0.2.0' });
    });

    it('handles no update available', () => {
        const { service, updater } = setup();
        updater.emitter.emit('update-not-available', { version: '0.1.0' });
        expect(service.getState()).toEqual({
            ...IDLE,
            status: 'not-available',
            message: 'You are on the latest version (0.1.0).'
        });
    });

    it('tracks download progress rounded to one decimal', () => {
        const { service, updater } = setup();
        updater.emitter.emit('update-available', { version: '0.2.0' });
        updater.emitter.emit('download-progress', { percent: 42.678 });
        expect(service.getState()).toEqual({ ...IDLE, status: 'downloading', version: '0.2.0', percent: 42.7 });
    });

    it('handles a finished download', () => {
        const { service, updater } = setup();
        updater.emitter.emit('update-downloaded', { version: '0.2.0' });
        expect(service.getState()).toEqual({ ...IDLE, status: 'downloaded', version: '0.2.0', percent: 100 });
    });

    it('handles updater errors', () => {
        const { service, updater } = setup();
        updater.emitter.emit('error', new Error('signature mismatch'));
        expect(service.getState()).toEqual({ ...IDLE, status: 'error', message: 'signature mismatch' });
    });

    it('notifies listeners on every state change with a copy', () => {
        const { updater, states } = setup();
        updater.emitter.emit('update-available', { version: '0.2.0' });
        updater.emitter.emit('download-progress', { percent: 10 });
        expect(states.map((state) => {
            return state.status;
        })).toEqual(['available', 'downloading']);
        expect(states[0]).not.toBe(states[1]);
    });
});

describe('AppUpdateService.download', () => {
    it('ignores the request unless an update is available', async () => {
        const { service, updater } = setup();
        await service.download();
        expect(updater.downloadUpdate).not.toHaveBeenCalled();
        expect(service.getState()).toEqual(IDLE);
    });

    it('starts downloading an available update', async () => {
        const { service, updater } = setup();
        updater.emitter.emit('update-available', { version: '0.2.0' });
        await service.download();
        expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
        expect(service.getState()).toEqual({ ...IDLE, status: 'downloading', version: '0.2.0', percent: 0 });
    });

    it('reports an error when the download rejects', async () => {
        const { service, updater } = setup();
        updater.emitter.emit('update-available', { version: '0.2.0' });
        updater.downloadUpdate.mockRejectedValueOnce(new Error('disk full'));
        await service.download();
        expect(service.getState()).toEqual({ ...IDLE, status: 'error', version: '0.2.0', message: 'disk full' });
    });
});

describe('AppUpdateService.install', () => {
    it('does nothing before the download finishes', () => {
        const { service, updater } = setup();
        updater.emitter.emit('update-available', { version: '0.2.0' });
        service.install();
        expect(updater.quitAndInstall).not.toHaveBeenCalled();
    });

    it('quits and installs after the download finishes, relaunching the app', () => {
        const { service, updater } = setup();
        updater.emitter.emit('update-downloaded', { version: '0.2.0' });
        service.install();
        expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
    });
});
