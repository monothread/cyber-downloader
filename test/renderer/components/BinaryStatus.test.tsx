// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BinaryStatus } from '@renderer/components/BinaryStatus';
import { useAppStore } from '@renderer/store/appStore';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initial, binaries: null, updating: false, notice: null });
});

describe('BinaryStatus', () => {
    it('shows pending chips before the check finishes', () => {
        render(<BinaryStatus />);
        expect(screen.getByText('yt-dlp …')).toBeInTheDocument();
        expect(screen.getByText('ffmpeg …')).toBeInTheDocument();
    });

    it('shows versions for found binaries', () => {
        useAppStore.setState({
            binaries: {
                ytdlp: { found: true, path: '/data/bin/yt-dlp', version: '2026.08.19', source: 'updated' },
                ffmpeg: { found: true, path: '/app/bin/ffmpeg', version: '7.0', source: 'bundled' }
            }
        });
        render(<BinaryStatus />);
        expect(screen.getByText('yt-dlp 2026.08.19')).toHaveClass('chip--ok');
        expect(screen.getByText('yt-dlp 2026.08.19')).toHaveAttribute('title', '/data/bin/yt-dlp (updated)');
        expect(screen.getByText('ffmpeg 7.0')).toHaveClass('chip--ok');
        expect(screen.getByText('ffmpeg 7.0')).toHaveAttribute('title', '/app/bin/ffmpeg (bundled)');
    });

    it('marks missing binaries', () => {
        useAppStore.setState({
            binaries: {
                ytdlp: { found: false, path: 'yt-dlp', version: null, source: 'system' },
                ffmpeg: { found: true, path: 'ffmpeg', version: null, source: 'system' }
            }
        });
        render(<BinaryStatus />);
        expect(screen.getByText('yt-dlp MISSING')).toHaveClass('chip--bad');
        expect(screen.getByText('yt-dlp MISSING')).toHaveAttribute('title', 'yt-dlp');
        expect(screen.getByText('ffmpeg')).toHaveClass('chip--ok');
    });

    it('updates yt-dlp when the button is clicked', async () => {
        render(<BinaryStatus />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'UPDATE YT-DLP' }));
        await waitFor(() => {
            expect(mock.api.updateYtdlp).toHaveBeenCalledTimes(1);
        });
    });

    it('disables the button while updating', () => {
        useAppStore.setState({ updating: true });
        render(<BinaryStatus />);
        expect(screen.getByRole('button', { name: 'UPDATING…' })).toBeDisabled();
    });
});
