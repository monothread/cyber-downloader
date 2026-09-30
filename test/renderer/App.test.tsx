// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { App } from '@renderer/App';
import { useAppStore } from '@renderer/store/appStore';
import { APP_UPDATE_IDLE, installMockApi, makeJob, type MockApiHandle } from '../helpers/mockApi';

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initial, tab: 'downloads', jobs: [], history: [], settings: DEFAULT_SETTINGS, binaries: null, notice: null, updating: false, appUpdate: { ...APP_UPDATE_IDLE, currentVersion: '' } });
});

describe('App', () => {
    it('shows a boot message until the binaries are checked, then the downloads tab', async () => {
        render(<App />);
        expect(screen.getByText('// BOOTING SYSTEMS…')).toBeInTheDocument();
        await waitFor(() => {
            expect(screen.getByLabelText('Link 1')).toBeInTheDocument();
        });
        expect(screen.queryByText('// BOOTING SYSTEMS…')).not.toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'CYBER//DL' })).toBeInTheDocument();
        expect(screen.getByText('yt-dlp 2026.08.19')).toBeInTheDocument();
    });

    it('marks the active tab and switches between sections', async () => {
        const user = userEvent.setup();
        render(<App />);
        await screen.findByLabelText('Link 1');
        expect(screen.getByRole('button', { name: 'DOWNLOADS' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByRole('button', { name: 'HISTORY' })).not.toHaveAttribute('aria-current');

        await user.click(screen.getByRole('button', { name: 'HISTORY' }));
        expect(screen.getByText('// HISTORY IS EMPTY.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'HISTORY' })).toHaveAttribute('aria-current', 'page');

        await user.click(screen.getByRole('button', { name: 'SETTINGS' }));
        expect(screen.getByText('Changes are saved automatically.')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'SAVE SETTINGS' })).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'DOWNLOADS' }));
        expect(screen.getByLabelText('Link 1')).toBeInTheDocument();
    });

    it('renders jobs pushed from the main process', async () => {
        render(<App />);
        await screen.findByLabelText('Link 1');
        act(() => {
            mock.emitJobUpdate(makeJob({ id: 'x', title: 'Pushed Video' }));
        });
        expect(screen.getByRole('heading', { name: 'Pushed Video' })).toBeInTheDocument();
    });

    it('shows the update banner when a new version is pushed', async () => {
        render(<App />);
        await screen.findByLabelText('Link 1');
        expect(screen.queryByText('Version 0.2.0 is available.')).not.toBeInTheDocument();
        act(() => {
            mock.emitAppUpdateState({ ...APP_UPDATE_IDLE, status: 'available', version: '0.2.0' });
        });
        expect(screen.getByText('Version 0.2.0 is available.')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'UPDATE TO 0.2.0' })).toBeInTheDocument();
    });

    it('unsubscribes from events on unmount', async () => {
        const { unmount } = render(<App />);
        await screen.findByLabelText('Link 1');
        unmount();
        expect(mock.unsubscribers).toHaveLength(5);
        mock.unsubscribers.forEach((unsubscribe) => {
            expect(unsubscribe).toHaveBeenCalledTimes(1);
        });
    });

    it('unsubscribes even when unmounted before initialization finishes', async () => {
        let release: () => void = () => {
            return undefined;
        };
        mock.api.checkBinaries.mockReturnValueOnce(
            new Promise((resolve) => {
                release = () => {
                    resolve({
                        ytdlp: { found: true, path: 'yt-dlp', version: '1', source: 'system' },
                        ffmpeg: { found: true, path: 'ffmpeg', version: '1', source: 'system' }
                    });
                };
            })
        );
        const { unmount } = render(<App />);
        unmount();
        release();
        await waitFor(() => {
            expect(mock.unsubscribers).toHaveLength(5);
        });
        mock.unsubscribers.forEach((unsubscribe) => {
            expect(unsubscribe).toHaveBeenCalledTimes(1);
        });
    });
});

describe('App theme', () => {
    let prefersDark = false;
    const listeners = new Set<() => void>();

    beforeEach(() => {
        prefersDark = false;
        listeners.clear();
        window.localStorage.clear();
        Object.defineProperty(window, 'matchMedia', {
            configurable: true,
            writable: true,
            value: (query: string) => {
                return {
                    media: query,
                    get matches() {
                        return prefersDark;
                    },
                    addEventListener: (_type: string, listener: () => void) => {
                        listeners.add(listener);
                    },
                    removeEventListener: (_type: string, listener: () => void) => {
                        listeners.delete(listener);
                    }
                };
            }
        });
    });

    afterEach(() => {
        delete document.documentElement.dataset.theme;
        Reflect.deleteProperty(window, 'matchMedia');
    });

    it.each(['cyberpunk', 'dark', 'light'] as const)('applies the %s theme from the stored settings', async (theme) => {
        mock.api.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, theme });
        render(<App />);
        await screen.findByLabelText('Link 1');
        expect(document.documentElement.dataset.theme).toBe(theme);
    });

    it('uses device by default and follows a dark system', async () => {
        prefersDark = true;
        render(<App />);
        await screen.findByLabelText('Link 1');
        expect(DEFAULT_SETTINGS.theme).toBe('device');
        expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('uses device by default and follows a light system', async () => {
        render(<App />);
        await screen.findByLabelText('Link 1');
        expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('follows the system when it switches between light and dark while open', async () => {
        render(<App />);
        await screen.findByLabelText('Link 1');
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(listeners.size).toBe(1);
        prefersDark = true;
        act(() => {
            listeners.forEach((listener) => {
                listener();
            });
        });
        expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it.each(['cyberpunk', 'dark', 'light'] as const)('does not follow the system with the %s theme', async (theme) => {
        mock.api.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, theme });
        render(<App />);
        await screen.findByLabelText('Link 1');
        expect(listeners.size).toBe(0);
    });

    it('stops following the system once a fixed theme is chosen', async () => {
        const user = userEvent.setup();
        render(<App />);
        await screen.findByLabelText('Link 1');
        await user.click(screen.getByRole('button', { name: 'SETTINGS' }));
        await user.selectOptions(screen.getByLabelText('Theme'), 'cyberpunk');
        await waitFor(() => {
            expect(document.documentElement.dataset.theme).toBe('cyberpunk');
        });
        expect(listeners.size).toBe(0);
    });

    it('changes the theme as soon as it is chosen in the settings and saves it', async () => {
        const user = userEvent.setup();
        render(<App />);
        await screen.findByLabelText('Link 1');
        await user.click(screen.getByRole('button', { name: 'SETTINGS' }));
        await user.selectOptions(screen.getByLabelText('Theme'), 'dark');
        await waitFor(() => {
            expect(document.documentElement.dataset.theme).toBe('dark');
        });
        expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, theme: 'dark' });
    });

    it('remembers the applied theme for the next start', async () => {
        mock.api.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, theme: 'cyberpunk' });
        render(<App />);
        await screen.findByLabelText('Link 1');
        expect(window.localStorage.getItem('cyber-dl-theme')).toBe('cyberpunk');
    });
});
