// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { BinaryStatus } from '@renderer/components/BinaryStatus';
import { UNSUPPORTED_STATUS, useAnimeStore } from '@renderer/store/animeStore';
import { useAppStore } from '@renderer/store/appStore';
import { ANI_CLI_INFO, makeStatus } from '../../helpers/animeFixtures';
import { installMockApi } from '../../helpers/mockApi';

const initial = useAppStore.getState();

beforeEach(() => {
    installMockApi();
    useAppStore.setState({ ...initial, binaries: null, updating: false, notice: null });
    useAnimeStore.setState({ status: UNSUPPORTED_STATUS });
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

    it('no longer has the yt-dlp update button (it lives in the settings)', () => {
        render(<BinaryStatus />);
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    describe('ani-cli', () => {
        it('has no chip where the anime section does not exist', () => {
            render(<BinaryStatus />);
            expect(screen.queryByText(/ani-cli/)).not.toBeInTheDocument();
        });

        it('shows the version of the ani-cli in use, with where it is and where it comes from', () => {
            useAnimeStore.setState({ status: makeStatus() });
            render(<BinaryStatus />);
            const chip = screen.getByText('ani-cli 5.1.4');
            expect(chip).toHaveClass('chip', 'chip--ok');
            expect(chip).toHaveAttribute('title', '/app/resources/bin/ani/ani-cli (bundled)');
        });

        it('shows an updated version', () => {
            useAnimeStore.setState({ status: makeStatus({ aniCli: { ...ANI_CLI_INFO, path: '/data/bin/ani-cli', version: '5.2.0', source: 'updated' } }) });
            render(<BinaryStatus />);
            expect(screen.getByText('ani-cli 5.2.0')).toHaveAttribute('title', '/data/bin/ani-cli (updated)');
        });

        it('shows when it is missing', () => {
            useAnimeStore.setState({ status: makeStatus({ available: false, aniCli: { ...ANI_CLI_INFO, found: false, version: null } }) });
            render(<BinaryStatus />);
            expect(screen.getByText('ani-cli MISSING')).toHaveClass('chip--bad');
        });

        it('sits after yt-dlp and ffmpeg', () => {
            useAnimeStore.setState({ status: makeStatus() });
            render(<BinaryStatus />);
            expect(
                Array.from(document.querySelectorAll('.chip')).map((chip) => {
                    return chip.textContent;
                })
            ).toEqual(['yt-dlp …', 'ffmpeg …', 'ani-cli 5.1.4']);
        });
    });
});
