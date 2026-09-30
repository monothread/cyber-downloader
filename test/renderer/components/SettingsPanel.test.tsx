// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { AUTOSAVE_DELAY_MS } from '@renderer/hooks/useAutoSaveSettings';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { SettingsPanel } from '@renderer/components/SettingsPanel';
import { INITIAL_APP_UPDATE, useAppStore } from '@renderer/store/appStore';
import { APP_UPDATE_IDLE, installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    vi.useFakeTimers();
    mock = installMockApi();
    useAppStore.setState({ ...initial, settings: DEFAULT_SETTINGS, notice: null, appUpdate: INITIAL_APP_UPDATE });
});

afterEach(() => {
    vi.useRealTimers();
});

async function advance(ms: number): Promise<void> {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
}

async function flushPromises(): Promise<void> {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
    });
}

function type(label: string, value: string): void {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('SettingsPanel layout', () => {
    it('renders every section with the stored values', () => {
        render(<SettingsPanel />);
        ['OUTPUT', 'QUALITY & FORMAT', 'BROWSER COOKIES', 'PLAYLISTS & SUBTITLES', 'ADVANCED', 'APP UPDATES'].forEach((legend) => {
            expect(screen.getByText(legend)).toBeInTheDocument();
        });
        expect(screen.getByLabelText('Download folder')).toHaveValue('');
        expect(screen.getByLabelText('Max title length (characters)')).toHaveValue(80);
        expect(screen.getByLabelText('Video quality')).toHaveValue('best');
        expect(screen.getByLabelText('Video container')).toHaveValue('mp4');
        expect(screen.getByLabelText('Audio only')).not.toBeChecked();
        expect(screen.getByLabelText('Audio format')).toHaveValue('mp3');
        expect(screen.getByLabelText('Use cookies from my browser')).not.toBeChecked();
        expect(screen.getByLabelText('Browser')).toHaveValue('firefox');
        expect(screen.getByLabelText('Simultaneous downloads')).toHaveValue(2);
    });

    it('has no save button and explains that changes are saved automatically', () => {
        render(<SettingsPanel />);
        expect(screen.queryByRole('button', { name: 'SAVE SETTINGS' })).not.toBeInTheDocument();
        expect(screen.getByText('Changes are saved automatically.')).toBeInTheDocument();
    });

    it('lists the resolution options with readable labels', () => {
        render(<SettingsPanel />);
        const options = Array.from(screen.getByLabelText('Video quality').querySelectorAll('option')).map((option) => {
            return option.textContent;
        });
        expect(options).toEqual(['Best available', 'Up to 2160p', 'Up to 1440p', 'Up to 1080p', 'Up to 720p', 'Up to 480p']);
    });
});

describe('SettingsPanel auto-save of toggles and selects (immediate)', () => {
    it.each([
        ['Restrict file names (ASCII only)', 'restrictFilenames'],
        ['Audio only', 'audioOnly'],
        ['Use cookies from my browser', 'useBrowserCookies'],
        ['Download whole playlist', 'downloadPlaylist'],
        ['Download subtitles', 'writeSubtitles'],
        ['Embed subtitles in the video', 'embedSubtitles']
    ] as const)('saves right away when "%s" is toggled', async (label, key) => {
        render(<SettingsPanel />);
        fireEvent.click(screen.getByLabelText(label));
        await flushPromises();
        expect(mock.api.saveSettings).toHaveBeenCalledTimes(1);
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, [key]: true });
    });

    it('saves right away when "Check for updates on startup" is turned off', async () => {
        render(<SettingsPanel />);
        fireEvent.click(screen.getByLabelText('Check for updates on startup'));
        await flushPromises();
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, checkUpdatesOnStart: false });
    });

    it.each([
        ['Video quality', '1080', 'maxResolution'],
        ['Video container', 'webm', 'videoContainer'],
        ['Audio format', 'opus', 'audioFormat'],
        ['Browser', 'chrome', 'cookiesBrowser']
    ] as const)('saves right away when "%s" changes', async (label, value, key) => {
        render(<SettingsPanel />);
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
        await flushPromises();
        expect(mock.api.saveSettings).toHaveBeenCalledTimes(1);
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, [key]: value });
    });

    it('shows the saved status after saving', async () => {
        render(<SettingsPanel />);
        fireEvent.click(screen.getByLabelText('Audio only'));
        await flushPromises();
        expect(screen.getByText('All changes saved.')).toBeInTheDocument();
    });
});

describe('SettingsPanel auto-save of text and number fields (2 s after typing)', () => {
    it.each([
        ['Download folder', '/media', 'downloadDir', '/media'],
        ['Max title length (characters)', '60', 'maxTitleLength', 60],
        ['Browser profile (optional)', 'Profile 1', 'cookiesProfile', 'Profile 1'],
        ['Subtitle languages', 'fr', 'subtitleLangs', 'fr'],
        ['Simultaneous downloads', '4', 'maxConcurrent', 4],
        ['Speed limit', '2M', 'rateLimit', '2M'],
        ['yt-dlp path', '/opt/yt-dlp', 'ytdlpPath', '/opt/yt-dlp'],
        ['ffmpeg path', '/opt/ffmpeg', 'ffmpegPath', '/opt/ffmpeg'],
        ['JavaScript runtime', 'node', 'jsRuntime', 'node'],
        ['Extra yt-dlp arguments', '--no-mtime', 'extraArgs', '--no-mtime']
    ] as const)('saves "%s" only after the delay', async (label, typed, key, expected) => {
        render(<SettingsPanel />);
        type(label, typed);
        expect(screen.getByText('Unsaved changes…')).toBeInTheDocument();
        await advance(AUTOSAVE_DELAY_MS - 1);
        expect(mock.api.saveSettings).not.toHaveBeenCalled();
        await advance(1);
        expect(mock.api.saveSettings).toHaveBeenCalledTimes(1);
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, [key]: expected });
        expect(screen.getByText('All changes saved.')).toBeInTheDocument();
    });

    it('waits for the user to stop typing and saves a single time with the final value', async () => {
        render(<SettingsPanel />);
        type('Download folder', '/m');
        await advance(1500);
        type('Download folder', '/media');
        await advance(1500);
        expect(mock.api.saveSettings).not.toHaveBeenCalled();
        await advance(500);
        expect(mock.api.saveSettings).toHaveBeenCalledTimes(1);
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, downloadDir: '/media' });
    });

    it('shows the sanitized value returned by the save', async () => {
        mock.api.saveSettings.mockResolvedValueOnce({ ...DEFAULT_SETTINGS, maxTitleLength: 200 });
        render(<SettingsPanel />);
        type('Max title length (characters)', '9999');
        expect(screen.getByLabelText('Max title length (characters)')).toHaveValue(9999);
        await advance(AUTOSAVE_DELAY_MS);
        expect(screen.getByLabelText('Max title length (characters)')).toHaveValue(200);
    });

    it('updates the store settings after saving', async () => {
        render(<SettingsPanel />);
        type('Download folder', '/media');
        await advance(AUTOSAVE_DELAY_MS);
        expect(useAppStore.getState().settings.downloadDir).toBe('/media');
    });

    it('saves pending edits when the panel is closed before the delay ends', () => {
        const { unmount } = render(<SettingsPanel />);
        type('Download folder', '/media');
        unmount();
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, downloadDir: '/media' });
    });

    it('shows an error status when saving fails', async () => {
        mock.api.saveSettings.mockRejectedValueOnce(new Error('disk full'));
        render(<SettingsPanel />);
        fireEvent.click(screen.getByLabelText('Audio only'));
        await flushPromises();
        expect(screen.getByText('Could not save the settings.')).toBeInTheDocument();
    });

    it('keeps every edit when several fields change in a row', async () => {
        render(<SettingsPanel />);
        fireEvent.click(screen.getByLabelText('Audio only'));
        type('Download folder', '/media');
        fireEvent.change(screen.getByLabelText('Audio format'), { target: { value: 'opus' } });
        await advance(AUTOSAVE_DELAY_MS);
        expect(mock.api.saveSettings).toHaveBeenLastCalledWith({
            ...DEFAULT_SETTINGS,
            audioOnly: true,
            downloadDir: '/media',
            audioFormat: 'opus'
        });
    });
});

describe('SettingsPanel folder chooser', () => {
    it('fills the folder from the directory chooser and saves it right away', async () => {
        mock.api.chooseDirectory.mockResolvedValueOnce('/picked/dir');
        render(<SettingsPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'BROWSE' }));
        await flushPromises();
        expect(screen.getByLabelText('Download folder')).toHaveValue('/picked/dir');
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, downloadDir: '/picked/dir' });
    });

    it('keeps the folder unchanged and does not save when the chooser is cancelled', async () => {
        mock.api.chooseDirectory.mockResolvedValueOnce(null);
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, downloadDir: '/keep' } });
        render(<SettingsPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'BROWSE' }));
        await flushPromises();
        expect(mock.api.chooseDirectory).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText('Download folder')).toHaveValue('/keep');
        expect(mock.api.saveSettings).not.toHaveBeenCalled();
    });
});

describe('SettingsPanel app updates', () => {
    it('shows the startup update check enabled by default', () => {
        render(<SettingsPanel />);
        expect(screen.getByLabelText('Check for updates on startup')).toBeChecked();
    });

    it('shows the app update summary and checks for updates on demand', async () => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, currentVersion: '0.1.0' } });
        render(<SettingsPanel />);
        expect(screen.getByText('Current version: 0.1.0')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'CHECK FOR UPDATES' }));
        await flushPromises();
        expect(mock.api.checkAppUpdate).toHaveBeenCalledTimes(1);
    });

    it.each(['checking', 'downloading'] as const)('disables the check button while %s', (status) => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, status, version: '0.2.0' } });
        render(<SettingsPanel />);
        expect(screen.getByRole('button', { name: 'CHECK FOR UPDATES' })).toBeDisabled();
    });

    it('offers the update action when a new version is available', async () => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, status: 'available', version: '0.2.0' } });
        render(<SettingsPanel />);
        expect(screen.getByText('Version 0.2.0 is available.')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'UPDATE TO 0.2.0' }));
        await flushPromises();
        expect(mock.api.downloadAppUpdate).toHaveBeenCalledTimes(1);
    });
});
