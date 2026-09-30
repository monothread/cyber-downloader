// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { SettingsPanel } from '@renderer/components/SettingsPanel';
import { INITIAL_APP_UPDATE, useAppStore } from '@renderer/store/appStore';
import { APP_UPDATE_IDLE, installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initial, settings: DEFAULT_SETTINGS, notice: null, appUpdate: INITIAL_APP_UPDATE });
});

async function save(): Promise<void> {
    await userEvent.setup().click(screen.getByRole('button', { name: 'SAVE SETTINGS' }));
}

describe('SettingsPanel', () => {
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

    it('lists the resolution options with readable labels', () => {
        render(<SettingsPanel />);
        const options = Array.from(screen.getByLabelText('Video quality').querySelectorAll('option')).map((option) => {
            return option.textContent;
        });
        expect(options).toEqual(['Best available', 'Up to 2160p', 'Up to 1440p', 'Up to 1080p', 'Up to 720p', 'Up to 480p']);
    });

    it('saves every edited field and shows a confirmation', async () => {
        const user = userEvent.setup();
        render(<SettingsPanel />);
        await user.type(screen.getByLabelText('Download folder'), '/media');
        fireEvent.change(screen.getByLabelText('Max title length (characters)'), { target: { value: '60' } });
        await user.click(screen.getByLabelText('Restrict file names (ASCII only)'));
        await user.selectOptions(screen.getByLabelText('Video quality'), '1080');
        await user.selectOptions(screen.getByLabelText('Video container'), 'webm');
        await user.click(screen.getByLabelText('Audio only'));
        await user.selectOptions(screen.getByLabelText('Audio format'), 'opus');
        await user.click(screen.getByLabelText('Use cookies from my browser'));
        await user.selectOptions(screen.getByLabelText('Browser'), 'chrome');
        await user.type(screen.getByLabelText('Browser profile (optional)'), 'Profile 1');
        await user.click(screen.getByLabelText('Check for updates on startup'));
        await user.click(screen.getByLabelText('Download whole playlist'));
        await user.click(screen.getByLabelText('Download subtitles'));
        await user.clear(screen.getByLabelText('Subtitle languages'));
        await user.type(screen.getByLabelText('Subtitle languages'), 'fr');
        await user.click(screen.getByLabelText('Embed subtitles in the video'));
        fireEvent.change(screen.getByLabelText('Simultaneous downloads'), { target: { value: '4' } });
        await user.type(screen.getByLabelText('Speed limit'), '2M');
        await user.type(screen.getByLabelText('yt-dlp path'), '/opt/yt-dlp');
        await user.type(screen.getByLabelText('ffmpeg path'), '/opt/ffmpeg');
        await user.type(screen.getByLabelText('JavaScript runtime'), 'node');
        await user.type(screen.getByLabelText('Extra yt-dlp arguments'), '--no-mtime');
        await save();

        const expected = {
            ...DEFAULT_SETTINGS,
            downloadDir: '/media',
            maxTitleLength: 60,
            restrictFilenames: true,
            maxResolution: '1080',
            videoContainer: 'webm',
            audioOnly: true,
            audioFormat: 'opus',
            useBrowserCookies: true,
            cookiesBrowser: 'chrome',
            cookiesProfile: 'Profile 1',
            downloadPlaylist: true,
            writeSubtitles: true,
            subtitleLangs: 'fr',
            embedSubtitles: true,
            maxConcurrent: 4,
            rateLimit: '2M',
            ytdlpPath: '/opt/yt-dlp',
            ffmpegPath: '/opt/ffmpeg',
            jsRuntime: 'node',
            checkUpdatesOnStart: false,
            extraArgs: '--no-mtime'
        };
        await waitFor(() => {
            expect(mock.api.saveSettings).toHaveBeenCalledWith(expected);
        });
        await waitFor(() => {
            expect(useAppStore.getState().notice).toEqual({ kind: 'info', message: 'Settings saved.' });
        });
        expect(useAppStore.getState().settings).toEqual(expected);
    });

    it('shows the sanitized values returned after saving', async () => {
        mock.api.saveSettings.mockResolvedValueOnce({ ...DEFAULT_SETTINGS, maxTitleLength: 200 });
        render(<SettingsPanel />);
        fireEvent.change(screen.getByLabelText('Max title length (characters)'), { target: { value: '9999' } });
        await save();
        await waitFor(() => {
            expect(screen.getByLabelText('Max title length (characters)')).toHaveValue(200);
        });
    });

    it('fills the folder from the directory chooser', async () => {
        mock.api.chooseDirectory.mockResolvedValueOnce('/picked/dir');
        render(<SettingsPanel />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'BROWSE' }));
        await waitFor(() => {
            expect(screen.getByLabelText('Download folder')).toHaveValue('/picked/dir');
        });
    });

    it('keeps the folder unchanged when the chooser is cancelled', async () => {
        mock.api.chooseDirectory.mockResolvedValueOnce(null);
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, downloadDir: '/keep' } });
        render(<SettingsPanel />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'BROWSE' }));
        await waitFor(() => {
            expect(mock.api.chooseDirectory).toHaveBeenCalledTimes(1);
        });
        expect(screen.getByLabelText('Download folder')).toHaveValue('/keep');
    });

    it('shows the startup update check enabled by default', () => {
        render(<SettingsPanel />);
        expect(screen.getByLabelText('Check for updates on startup')).toBeChecked();
    });

    it('shows the app update summary and checks for updates on demand', async () => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, currentVersion: '0.1.0' } });
        render(<SettingsPanel />);
        expect(screen.getByText('Current version: 0.1.0')).toBeInTheDocument();
        await userEvent.setup().click(screen.getByRole('button', { name: 'CHECK FOR UPDATES' }));
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
        await userEvent.setup().click(screen.getByRole('button', { name: 'UPDATE TO 0.2.0' }));
        expect(mock.api.downloadAppUpdate).toHaveBeenCalledTimes(1);
    });
});
