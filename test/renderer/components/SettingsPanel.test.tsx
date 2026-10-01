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
    useAppStore.setState({ ...initial, settings: DEFAULT_SETTINGS, notice: null, appUpdate: INITIAL_APP_UPDATE, traySupport: null, browsers: null });
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
        ['APPEARANCE & WINDOW', 'OUTPUT', 'QUALITY & FORMAT', 'PLAYLISTS & SUBTITLES', 'LIVE STREAMS', 'BROWSER COOKIES', 'YT-DLP', 'APP UPDATES', 'ADVANCED'].forEach((legend) => {
            expect(screen.getByText(legend)).toBeInTheDocument();
        });
        expect(screen.getByLabelText('Download folder')).toHaveValue('');
        expect(screen.getByLabelText('Max title length (characters)')).toHaveValue(80);
        expect(screen.getByLabelText('Video quality')).toHaveValue('best');
        expect(screen.getByLabelText('Video container')).toHaveValue('mp4');
        expect(screen.getByLabelText('Audio only')).not.toBeChecked();
        expect(screen.getByLabelText('Audio format')).toHaveValue('mp3');
        expect(screen.getByLabelText('Use cookies from my browser')).not.toBeChecked();
        expect(screen.getByLabelText('Browser')).toHaveValue('');
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
        ['Include auto-generated subtitles', 'autoSubtitles'],
        ['Embed subtitles in the video', 'embedSubtitles'],
        ['Keep running in the system tray when the window is closed', 'closeToTray'],
        ['Record live streams from the start', 'liveFromStart'],
        ['Wait for scheduled live streams to start', 'waitForLive']
    ] as const)('saves right away when "%s" is toggled', async (label, key) => {
        render(<SettingsPanel />);
        fireEvent.click(screen.getByLabelText(label));
        await flushPromises();
        expect(mock.api.saveSettings).toHaveBeenCalledTimes(1);
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, [key]: true });
    });

    it('has the partial file cleanup on by default and saves right away when it is turned off', async () => {
        render(<SettingsPanel />);
        const toggle = screen.getByLabelText('Delete partial files when a download fails or is cancelled');
        expect(toggle).toBeChecked();
        expect(screen.getByText('Live recordings are always kept, because they can still be saved. A retry starts over once the partial file is gone.')).toBeInTheDocument();
        fireEvent.click(toggle);
        await flushPromises();
        expect(mock.api.saveSettings).toHaveBeenCalledTimes(1);
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, deletePartialsOnFailure: false });
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
        ['Audio format', 'opus', 'audioFormat']
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

describe('SettingsPanel browser cookies', () => {
    const ORIGIN = {
        label: 'Brave Origin',
        engine: 'brave' as const,
        dataDir: '/home/a/.config/BraveSoftware/Brave-Origin',
        profiles: [
            { id: 'Default', name: 'Personal' },
            { id: 'Profile 1', name: 'Work' }
        ]
    };
    const FIREFOX = {
        label: 'Firefox',
        engine: 'firefox' as const,
        dataDir: '/home/a/.mozilla/firefox',
        profiles: [{ id: 'abc.default-release', name: 'abc.default-release' }]
    };

    function optionTexts(): Array<string | null> {
        return Array.from(screen.getByLabelText('Browser').querySelectorAll('option')).map((option) => {
            return option.textContent;
        });
    }

    it('loads the detected browsers when opened', async () => {
        render(<SettingsPanel />);
        await flushPromises();
        expect(mock.api.listBrowsers).toHaveBeenCalledTimes(1);
        expect(mock.api.listBrowsers).toHaveBeenCalledWith(false);
    });

    it('lists only the detected browsers, with a placeholder while none is chosen', async () => {
        mock.api.listBrowsers.mockResolvedValue([FIREFOX, ORIGIN]);
        render(<SettingsPanel />);
        await flushPromises();
        expect(optionTexts()).toEqual(['Choose a browser…', 'Firefox', 'Brave Origin']);
        expect(screen.getByLabelText('Browser')).toHaveValue('');
    });

    it('selects the saved browser and drops the placeholder', async () => {
        mock.api.listBrowsers.mockResolvedValue([FIREFOX, ORIGIN]);
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, useBrowserCookies: true, cookiesBrowser: 'brave', cookiesBrowserDir: ORIGIN.dataDir } });
        render(<SettingsPanel />);
        await flushPromises();
        expect(optionTexts()).toEqual(['Firefox', 'Brave Origin']);
        expect(screen.getByLabelText('Browser')).toHaveValue(ORIGIN.dataDir);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('saves the engine and the folder together, right away, when a browser is chosen', async () => {
        mock.api.listBrowsers.mockResolvedValue([FIREFOX, ORIGIN]);
        render(<SettingsPanel />);
        await flushPromises();
        fireEvent.change(screen.getByLabelText('Browser'), { target: { value: ORIGIN.dataDir } });
        await flushPromises();
        expect(mock.api.saveSettings).toHaveBeenCalledTimes(1);
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, cookiesBrowser: 'brave', cookiesBrowserDir: ORIGIN.dataDir, cookiesProfile: '' });
    });

    it('clears the saved profile when another browser is chosen', async () => {
        mock.api.listBrowsers.mockResolvedValue([FIREFOX, ORIGIN]);
        useAppStore.setState({
            settings: { ...DEFAULT_SETTINGS, useBrowserCookies: true, cookiesBrowser: 'brave', cookiesBrowserDir: ORIGIN.dataDir, cookiesProfile: 'Profile 1' }
        });
        render(<SettingsPanel />);
        await flushPromises();
        fireEvent.change(screen.getByLabelText('Browser'), { target: { value: FIREFOX.dataDir } });
        await flushPromises();
        expect(mock.api.saveSettings).toHaveBeenCalledWith({
            ...DEFAULT_SETTINGS,
            useBrowserCookies: true,
            cookiesBrowser: 'firefox',
            cookiesBrowserDir: FIREFOX.dataDir,
            cookiesProfile: ''
        });
    });

    function profileOptionTexts(): Array<string | null> {
        return Array.from(screen.getByLabelText('Browser profile (optional)').querySelectorAll('option')).map((option) => {
            return option.textContent;
        });
    }

    it('shows the profiles of the chosen browser as a menu, with the names the user gave them', async () => {
        mock.api.listBrowsers.mockResolvedValue([ORIGIN]);
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, cookiesBrowser: 'brave', cookiesBrowserDir: ORIGIN.dataDir } });
        render(<SettingsPanel />);
        await flushPromises();
        expect(screen.getByLabelText('Browser profile (optional)').tagName).toBe('SELECT');
        expect(profileOptionTexts()).toEqual(['Automatic (most recently used)', 'Personal (Default)', 'Work (Profile 1)']);
        expect(screen.getByLabelText('Browser profile (optional)')).toHaveValue('');
    });

    it('shows a profile whose name is its folder only once', async () => {
        mock.api.listBrowsers.mockResolvedValue([FIREFOX]);
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, cookiesBrowser: 'firefox', cookiesBrowserDir: FIREFOX.dataDir } });
        render(<SettingsPanel />);
        await flushPromises();
        expect(profileOptionTexts()).toEqual(['Automatic (most recently used)', 'abc.default-release']);
    });

    it('saves the chosen profile right away', async () => {
        mock.api.listBrowsers.mockResolvedValue([ORIGIN]);
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, cookiesBrowser: 'brave', cookiesBrowserDir: ORIGIN.dataDir } });
        render(<SettingsPanel />);
        await flushPromises();
        fireEvent.change(screen.getByLabelText('Browser profile (optional)'), { target: { value: 'Profile 1' } });
        await flushPromises();
        expect(mock.api.saveSettings).toHaveBeenCalledTimes(1);
        expect(mock.api.saveSettings).toHaveBeenCalledWith({
            ...DEFAULT_SETTINGS,
            cookiesBrowser: 'brave',
            cookiesBrowserDir: ORIGIN.dataDir,
            cookiesProfile: 'Profile 1'
        });
    });

    it('keeps a saved profile that no longer exists in the menu and marks it', async () => {
        mock.api.listBrowsers.mockResolvedValue([ORIGIN]);
        useAppStore.setState({
            settings: { ...DEFAULT_SETTINGS, cookiesBrowser: 'brave', cookiesBrowserDir: ORIGIN.dataDir, cookiesProfile: 'Profile 9' }
        });
        render(<SettingsPanel />);
        await flushPromises();
        expect(profileOptionTexts()).toEqual(['Automatic (most recently used)', 'Personal (Default)', 'Work (Profile 1)', 'Profile 9 (not found)']);
        expect(screen.getByLabelText('Browser profile (optional)')).toHaveValue('Profile 9');
    });

    it('keeps a text field for the profile while no detected browser is chosen', async () => {
        mock.api.listBrowsers.mockResolvedValue([ORIGIN]);
        render(<SettingsPanel />);
        await flushPromises();
        expect(screen.getByLabelText('Browser profile (optional)').tagName).toBe('INPUT');
    });

    it('keeps a text field for the profile when the chosen browser reports no profile', async () => {
        mock.api.listBrowsers.mockResolvedValue([{ ...FIREFOX, profiles: [] }]);
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, cookiesBrowser: 'firefox', cookiesBrowserDir: FIREFOX.dataDir } });
        render(<SettingsPanel />);
        await flushPromises();
        expect(screen.getByLabelText('Browser profile (optional)').tagName).toBe('INPUT');
    });

    it('warns that the saved browser was not found when the cookies are on', async () => {
        mock.api.listBrowsers.mockResolvedValue([FIREFOX]);
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, useBrowserCookies: true, cookiesBrowser: 'brave' } });
        render(<SettingsPanel />);
        await flushPromises();
        expect(screen.getByRole('alert')).toHaveTextContent('The saved browser (brave) was not found on this system. Choose one of the detected browsers.');
    });

    it('warns when no browser is found at all', async () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, useBrowserCookies: true } });
        render(<SettingsPanel />);
        await flushPromises();
        expect(screen.getByRole('alert')).toHaveTextContent('No browser with saved cookies was found on this system.');
        expect(optionTexts()).toEqual(['Choose a browser…']);
    });

    it('does not warn while the cookies are off', async () => {
        mock.api.listBrowsers.mockResolvedValue([FIREFOX]);
        render(<SettingsPanel />);
        await flushPromises();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('scans again and shows the new browsers when RESCAN BROWSERS is clicked', async () => {
        mock.api.listBrowsers.mockResolvedValueOnce([FIREFOX]).mockResolvedValueOnce([FIREFOX, ORIGIN]);
        render(<SettingsPanel />);
        await flushPromises();
        expect(optionTexts()).toEqual(['Choose a browser…', 'Firefox']);
        fireEvent.click(screen.getByRole('button', { name: 'RESCAN BROWSERS' }));
        await flushPromises();
        expect(mock.api.listBrowsers).toHaveBeenLastCalledWith(true);
        expect(optionTexts()).toEqual(['Choose a browser…', 'Firefox', 'Brave Origin']);
    });
});

describe('SettingsPanel auto-generated subtitles warning', () => {
    const WARNING =
        'Auto-generated subtitles need a language. Fill in "Subtitle languages" in Settings (e.g. ja), or turn off "Include auto-generated subtitles".';

    it('warns when auto-generated subtitles are on and no language is set', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, writeSubtitles: true, autoSubtitles: true, subtitleLangs: '' } });
        render(<SettingsPanel />);
        expect(screen.getByRole('alert')).toHaveTextContent(WARNING);
    });

    it('warns when the language is "all"', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, writeSubtitles: true, autoSubtitles: true, subtitleLangs: 'all' } });
        render(<SettingsPanel />);
        expect(screen.getByRole('alert')).toHaveTextContent(WARNING);
    });

    it('does not warn when a language is set', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, writeSubtitles: true, autoSubtitles: true, subtitleLangs: 'ja' } });
        render(<SettingsPanel />);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not warn when auto-generated subtitles are off', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, writeSubtitles: true, autoSubtitles: false, subtitleLangs: '' } });
        render(<SettingsPanel />);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not warn when subtitles are off', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, writeSubtitles: false, autoSubtitles: true, subtitleLangs: '' } });
        render(<SettingsPanel />);
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows and hides the warning as the languages field is edited', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, writeSubtitles: true, autoSubtitles: true, subtitleLangs: '' } });
        render(<SettingsPanel />);
        expect(screen.getByRole('alert')).toHaveTextContent(WARNING);
        fireEvent.change(screen.getByLabelText('Subtitle languages'), { target: { value: 'ja' } });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
});

describe('SettingsPanel system tray', () => {
    const TRAY_LABEL = 'Keep running in the system tray when the window is closed';

    it('is off by default and explains how to quit', () => {
        render(<SettingsPanel />);
        expect(screen.getByLabelText(TRAY_LABEL)).not.toBeChecked();
        expect(screen.getByText('Downloads keep going in the background. Right-click the tray icon to quit completely.')).toBeInTheDocument();
    });

    it('reflects the stored value', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, closeToTray: true } });
        render(<SettingsPanel />);
        expect(screen.getByLabelText(TRAY_LABEL)).toBeChecked();
    });

    it('checks the tray support when opened and again when the option changes', async () => {
        render(<SettingsPanel />);
        await flushPromises();
        expect(mock.api.getTraySupport).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByLabelText(TRAY_LABEL));
        await flushPromises();
        expect(mock.api.getTraySupport).toHaveBeenCalledTimes(2);
    });

    it('warns when the option is on and the environment has no tray', async () => {
        mock.api.getTraySupport.mockResolvedValue({ available: false, reason: 'No system tray was detected.' });
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, closeToTray: true } });
        render(<SettingsPanel />);
        await flushPromises();
        expect(screen.getByRole('alert')).toHaveTextContent('No system tray was detected.');
    });

    it('does not warn when the option is off, even without a tray', async () => {
        mock.api.getTraySupport.mockResolvedValue({ available: false, reason: 'No system tray was detected.' });
        render(<SettingsPanel />);
        await flushPromises();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not warn when a tray is available', async () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, closeToTray: true } });
        render(<SettingsPanel />);
        await flushPromises();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows the warning as soon as the option is turned on', async () => {
        mock.api.getTraySupport.mockResolvedValue({ available: false, reason: 'No system tray was detected.' });
        render(<SettingsPanel />);
        await flushPromises();
        fireEvent.click(screen.getByLabelText(TRAY_LABEL));
        await flushPromises();
        expect(screen.getByRole('alert')).toHaveTextContent('No system tray was detected.');
    });
});

describe('SettingsPanel live streams', () => {
    it('are off by default and explain what they do', () => {
        render(<SettingsPanel />);
        expect(screen.getByLabelText('Record live streams from the start')).not.toBeChecked();
        expect(screen.getByLabelText('Wait for scheduled live streams to start')).not.toBeChecked();
        expect(screen.getByText(/keeps the past part of the stream available \(DVR\)/)).toBeInTheDocument();
        expect(screen.getByText('Keeps checking every 30 seconds until the stream goes live. Cancel to stop waiting.')).toBeInTheDocument();
    });

    it('reflect the stored values', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, liveFromStart: true, waitForLive: true } });
        render(<SettingsPanel />);
        expect(screen.getByLabelText('Record live streams from the start')).toBeChecked();
        expect(screen.getByLabelText('Wait for scheduled live streams to start')).toBeChecked();
    });
});

describe('SettingsPanel theme', () => {
    it('offers device, cyberpunk, dark and light, device being the default', () => {
        render(<SettingsPanel />);
        const select = screen.getByLabelText('Theme') as HTMLSelectElement;
        expect(select).toHaveValue('device');
        expect(
            Array.from(select.options).map((option) => {
                return [option.value, option.textContent];
            })
        ).toEqual([
            ['device', 'Device (follows the system)'],
            ['cyberpunk', 'Cyberpunk (neon)'],
            ['dark', 'Dark'],
            ['light', 'Light']
        ]);
        expect(screen.getByText('Device follows the light or dark mode of your system. Saved and restored the next time the app opens.')).toBeInTheDocument();
    });

    it.each(['cyberpunk', 'dark', 'light'] as const)('saves right away when %s is chosen', async (theme) => {
        render(<SettingsPanel />);
        fireEvent.change(screen.getByLabelText('Theme'), { target: { value: theme } });
        await flushPromises();
        expect(mock.api.saveSettings).toHaveBeenCalledTimes(1);
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, theme });
    });

    it('reflects the stored theme', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, theme: 'light' } });
        render(<SettingsPanel />);
        expect(screen.getByLabelText('Theme')).toHaveValue('light');
    });
});

describe('SettingsPanel yt-dlp update', () => {
    const BINARIES = {
        ytdlp: { found: true, path: '/data/bin/yt-dlp', version: '2026.08.19', source: 'updated' as const },
        ffmpeg: { found: true, path: '/app/bin/ffmpeg', version: '7.0', source: 'bundled' as const }
    };

    it('shows the installed version and the update button', () => {
        useAppStore.setState({ binaries: BINARIES, updating: false });
        render(<SettingsPanel />);
        expect(screen.getByText('Installed version: 2026.08.19')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'UPDATE YT-DLP' })).toBeEnabled();
    });

    it('says when the version is unknown or yt-dlp was not found', () => {
        useAppStore.setState({ binaries: { ...BINARIES, ytdlp: { ...BINARIES.ytdlp, version: null } } });
        const { unmount } = render(<SettingsPanel />);
        expect(screen.getByText('Installed version: unknown')).toBeInTheDocument();
        unmount();
        useAppStore.setState({ binaries: { ...BINARIES, ytdlp: { ...BINARIES.ytdlp, found: false } } });
        render(<SettingsPanel />);
        expect(screen.getByText('yt-dlp was not found.')).toBeInTheDocument();
    });

    it('updates yt-dlp when the button is clicked', async () => {
        useAppStore.setState({ binaries: BINARIES, updating: false });
        render(<SettingsPanel />);
        fireEvent.click(screen.getByRole('button', { name: 'UPDATE YT-DLP' }));
        await flushPromises();
        expect(mock.api.updateYtdlp).toHaveBeenCalledTimes(1);
    });

    it('disables the button and says it is updating', () => {
        useAppStore.setState({ binaries: BINARIES, updating: true });
        render(<SettingsPanel />);
        expect(screen.getByRole('button', { name: 'UPDATING…' })).toBeDisabled();
    });
});

