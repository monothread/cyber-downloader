// @vitest-environment jsdom
import { DEFAULT_SETTINGS } from '@shared/constants';
import type { HistoryEntry } from '@shared/types';
import { INITIAL_APP_UPDATE, upsertJob, useAppStore } from '@renderer/store/appStore';
import { APP_UPDATE_IDLE, installMockApi, makeJob, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initial, jobs: [], history: [], settings: DEFAULT_SETTINGS, binaries: null, notice: null, updating: false, appUpdate: INITIAL_APP_UPDATE, tab: 'downloads' });
});

const HISTORY_ENTRY: HistoryEntry = { id: 'h1', url: 'https://x.com', title: 'T', filePath: '/d/T.mp4', status: 'done', errorTitle: null, finishedAt: 5 };

describe('upsertJob', () => {
    it('appends a job that does not exist', () => {
        expect(upsertJob([makeJob({ id: 'a' })], makeJob({ id: 'b' }))).toEqual([makeJob({ id: 'a' }), makeJob({ id: 'b' })]);
    });

    it('replaces a job with the same id preserving order', () => {
        const result = upsertJob([makeJob({ id: 'a' }), makeJob({ id: 'b' })], makeJob({ id: 'a', percent: 99 }));
        expect(result).toEqual([makeJob({ id: 'a', percent: 99 }), makeJob({ id: 'b' })]);
    });
});

describe('useAppStore basics', () => {
    it('has the expected initial state', () => {
        expect(initial.tab).toBe('downloads');
        expect(initial.jobs).toEqual([]);
        expect(initial.binaries).toBeNull();
        expect(initial.notice).toBeNull();
    });

    it('sets the tab and the notice', () => {
        useAppStore.getState().setTab('history');
        useAppStore.getState().setNotice({ kind: 'info', message: 'hi' });
        expect(useAppStore.getState().tab).toBe('history');
        expect(useAppStore.getState().notice).toEqual({ kind: 'info', message: 'hi' });
        useAppStore.getState().setNotice(null);
        expect(useAppStore.getState().notice).toBeNull();
    });
});

describe('useAppStore.init', () => {
    it('loads settings, jobs, history and binaries', async () => {
        const job = makeJob();
        mock.api.listJobs.mockResolvedValueOnce([job]);
        mock.api.listHistory.mockResolvedValueOnce([HISTORY_ENTRY]);
        mock.api.getSettings.mockResolvedValueOnce({ ...DEFAULT_SETTINGS, downloadDir: '/x' });
        await useAppStore.getState().init();
        const state = useAppStore.getState();
        expect(state.jobs).toEqual([job]);
        expect(state.history).toEqual([HISTORY_ENTRY]);
        expect(state.settings).toEqual({ ...DEFAULT_SETTINGS, downloadDir: '/x' });
        expect(state.binaries?.ytdlp.version).toBe('2026.08.19');
    });

    it('applies job updates and removals pushed from the main process', async () => {
        await useAppStore.getState().init();
        mock.emitJobUpdate(makeJob({ id: 'a' }));
        mock.emitJobUpdate(makeJob({ id: 'b' }));
        mock.emitJobUpdate(makeJob({ id: 'a', percent: 80 }));
        expect(useAppStore.getState().jobs).toEqual([makeJob({ id: 'a', percent: 80 }), makeJob({ id: 'b' })]);
        mock.emitJobRemoved('a');
        expect(useAppStore.getState().jobs).toEqual([makeJob({ id: 'b' })]);
    });

    it('refreshes the history when it changes', async () => {
        await useAppStore.getState().init();
        mock.api.listHistory.mockResolvedValueOnce([HISTORY_ENTRY]);
        mock.emitHistoryChanged();
        await vi.waitFor(() => {
            expect(useAppStore.getState().history).toEqual([HISTORY_ENTRY]);
        });
    });

    it('loads the app update state and applies pushed changes', async () => {
        mock.api.getAppUpdateState.mockResolvedValueOnce({ ...APP_UPDATE_IDLE, currentVersion: '0.3.0' });
        await useAppStore.getState().init();
        expect(useAppStore.getState().appUpdate).toEqual({ ...APP_UPDATE_IDLE, currentVersion: '0.3.0' });
        const available = { ...APP_UPDATE_IDLE, status: 'available' as const, version: '0.4.0' };
        mock.emitAppUpdateState(available);
        expect(useAppStore.getState().appUpdate).toEqual(available);
    });

    it('returns a cleanup that unsubscribes every listener', async () => {
        const cleanup = await useAppStore.getState().init();
        expect(mock.unsubscribers).toHaveLength(4);
        cleanup();
        mock.unsubscribers.forEach((unsubscribe) => {
            expect(unsubscribe).toHaveBeenCalledTimes(1);
        });
    });
});

describe('useAppStore.addUrls', () => {
    it('adds each URL separately and returns the results in order', async () => {
        mock.api.addDownload.mockResolvedValueOnce({ ok: true, job: null, message: null });
        mock.api.addDownload.mockResolvedValueOnce({ ok: false, job: null, message: 'Invalid URL. Use an http(s) link.' });
        const results = await useAppStore.getState().addUrls(['https://a.com', 'nope']);
        expect(mock.api.addDownload.mock.calls).toEqual([['https://a.com'], ['nope']]);
        expect(results).toEqual([
            { ok: true, job: null, message: null },
            { ok: false, job: null, message: 'Invalid URL. Use an http(s) link.' }
        ]);
    });

    it('does not call the API and returns nothing for an empty list', async () => {
        await expect(useAppStore.getState().addUrls([])).resolves.toEqual([]);
        expect(mock.api.addDownload).not.toHaveBeenCalled();
    });

    it('does not set a notice; feedback is shown by the caller', async () => {
        mock.api.addDownload.mockResolvedValueOnce({ ok: false, job: null, message: 'bad' });
        await useAppStore.getState().addUrls(['nope']);
        expect(useAppStore.getState().notice).toBeNull();
    });
});

describe('useAppStore queue actions', () => {
    it('forwards cancel, retry, remove and clearFinished', async () => {
        const state = useAppStore.getState();
        await state.cancelJob('a');
        await state.retryJob('b');
        await state.removeJob('c');
        await state.clearFinished();
        expect(mock.api.cancelJob).toHaveBeenCalledWith('a');
        expect(mock.api.retryJob).toHaveBeenCalledWith('b');
        expect(mock.api.removeJob).toHaveBeenCalledWith('c');
        expect(mock.api.clearFinished).toHaveBeenCalledTimes(1);
    });
});

describe('useAppStore history', () => {
    it('refreshes the history from the API', async () => {
        mock.api.listHistory.mockResolvedValueOnce([HISTORY_ENTRY]);
        await useAppStore.getState().refreshHistory();
        expect(useAppStore.getState().history).toEqual([HISTORY_ENTRY]);
    });

    it('clears the history', async () => {
        useAppStore.setState({ history: [HISTORY_ENTRY] });
        await useAppStore.getState().clearHistory();
        expect(mock.api.clearHistory).toHaveBeenCalledTimes(1);
        expect(useAppStore.getState().history).toEqual([]);
    });
});

describe('useAppStore settings and binaries', () => {
    it('saves settings and stores the sanitized result', async () => {
        const sanitized = { ...DEFAULT_SETTINGS, maxTitleLength: 200 };
        mock.api.saveSettings.mockResolvedValueOnce(sanitized);
        const result = await useAppStore.getState().saveSettings({ ...DEFAULT_SETTINGS, maxTitleLength: 5000 });
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, maxTitleLength: 5000 });
        expect(result).toEqual(sanitized);
        expect(useAppStore.getState().settings).toEqual(sanitized);
    });

    it('does not re-check the binaries when their paths did not change', async () => {
        await useAppStore.getState().saveSettings({ ...DEFAULT_SETTINGS, audioOnly: true, downloadDir: '/x' });
        expect(mock.api.checkBinaries).not.toHaveBeenCalled();
        expect(useAppStore.getState().binaries).toBeNull();
    });

    it.each([
        ['ytdlpPath', '/opt/yt-dlp'],
        ['ffmpegPath', '/opt/ffmpeg']
    ] as const)('re-checks the binaries when %s changes', async (key, value) => {
        await useAppStore.getState().saveSettings({ ...DEFAULT_SETTINGS, [key]: value });
        expect(mock.api.checkBinaries).toHaveBeenCalledTimes(1);
        expect(useAppStore.getState().binaries).not.toBeNull();
    });

    it('does not re-check again when the same custom path is saved twice', async () => {
        await useAppStore.getState().saveSettings({ ...DEFAULT_SETTINGS, ytdlpPath: '/opt/yt-dlp' });
        await useAppStore.getState().saveSettings({ ...DEFAULT_SETTINGS, ytdlpPath: '/opt/yt-dlp', audioOnly: true });
        expect(mock.api.checkBinaries).toHaveBeenCalledTimes(1);
    });

    it('opens the directory chooser', async () => {
        mock.api.chooseDirectory.mockResolvedValueOnce('/picked');
        await expect(useAppStore.getState().chooseDirectory()).resolves.toBe('/picked');
    });
});

describe('useAppStore.updateYtdlp', () => {
    it('shows an info notice with the output on success', async () => {
        mock.api.updateYtdlp.mockResolvedValueOnce({ ok: true, output: 'Updated to 2026.09' });
        await useAppStore.getState().updateYtdlp();
        expect(useAppStore.getState().updating).toBe(false);
        expect(useAppStore.getState().notice).toEqual({ kind: 'info', message: 'Updated to 2026.09' });
        expect(mock.api.checkBinaries).toHaveBeenCalledTimes(1);
    });

    it('shows an error notice on failure', async () => {
        mock.api.updateYtdlp.mockResolvedValueOnce({ ok: false, output: 'Permission denied' });
        await useAppStore.getState().updateYtdlp();
        expect(useAppStore.getState().notice).toEqual({ kind: 'error', message: 'Permission denied' });
    });

    it('uses fallback messages when the output is empty', async () => {
        mock.api.updateYtdlp.mockResolvedValueOnce({ ok: true, output: '' });
        await useAppStore.getState().updateYtdlp();
        expect(useAppStore.getState().notice).toEqual({ kind: 'info', message: 'yt-dlp is up to date.' });
        mock.api.updateYtdlp.mockResolvedValueOnce({ ok: false, output: '' });
        await useAppStore.getState().updateYtdlp();
        expect(useAppStore.getState().notice).toEqual({ kind: 'error', message: 'Update failed.' });
    });

    it('marks the store as updating while the request is pending', async () => {
        let release: () => void = () => {
            return undefined;
        };
        mock.api.updateYtdlp.mockReturnValueOnce(
            new Promise((resolve) => {
                release = () => {
                    resolve({ ok: true, output: 'done' });
                };
            })
        );
        const pending = useAppStore.getState().updateYtdlp();
        expect(useAppStore.getState().updating).toBe(true);
        release();
        await pending;
        expect(useAppStore.getState().updating).toBe(false);
    });
});

describe('useAppStore app updates', () => {
    it('starts with the idle placeholder state', () => {
        expect(initial.appUpdate).toEqual({ status: 'idle', currentVersion: '', version: null, percent: 0, message: null });
    });

    it('forwards check, download and install to the API', async () => {
        const state = useAppStore.getState();
        await state.checkAppUpdate();
        await state.downloadAppUpdate();
        await state.installAppUpdate();
        expect(mock.api.checkAppUpdate).toHaveBeenCalledTimes(1);
        expect(mock.api.downloadAppUpdate).toHaveBeenCalledTimes(1);
        expect(mock.api.installAppUpdate).toHaveBeenCalledTimes(1);
    });
});
