// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DownloadError, DownloadJob } from '@shared/types';
import { JobCard } from '@renderer/components/JobCard';
import { useAppStore } from '@renderer/store/appStore';
import { installMockApi, makeJob, type MockApiHandle } from '../../helpers/mockApi';

const ERROR: DownloadError = { code: 'UNAVAILABLE', title: 'Video unavailable', hint: 'Maybe private.', raw: 'ERROR: gone' };
const UNSUPPORTED: DownloadError = { code: 'OUTDATED', title: 'yt-dlp may be outdated', hint: 'Update.', raw: 'ERROR: Unsupported URL' };

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initial, streamSearches: {} });
});

function renderCard(job: DownloadJob) {
    const handlers = { onCancel: vi.fn(), onRetry: vi.fn(), onRemove: vi.fn(), onShowFile: vi.fn() };
    render(<JobCard job={job} {...handlers} />);
    return handlers;
}

describe('JobCard', () => {
    it('shows title, status, progress, speed and ETA for a running job', () => {
        renderCard(makeJob());
        expect(screen.getByRole('heading', { name: 'Some Video' })).toBeInTheDocument();
        expect(screen.getByText('DOWNLOADING')).toBeInTheDocument();
        expect(screen.getByText('42.5%')).toBeInTheDocument();
        expect(screen.getByText('1.5MiB/s')).toBeInTheDocument();
        expect(screen.getByText('ETA 00:10')).toBeInTheDocument();
        const bar = screen.getByRole('progressbar');
        expect(bar).toHaveAttribute('aria-valuenow', '43');
        expect(bar.firstElementChild).toHaveStyle({ width: '42.5%' });
    });

    it('falls back to the URL when there is no title', () => {
        renderCard(makeJob({ title: null }));
        expect(screen.getByRole('heading', { name: 'https://example.com/v' })).toBeInTheDocument();
    });

    it('omits speed and ETA when empty', () => {
        renderCard(makeJob({ speed: '', eta: '' }));
        expect(screen.queryByText(/ETA/)).not.toBeInTheDocument();
        expect(screen.queryByText('1.5MiB/s')).not.toBeInTheDocument();
    });

    it('offers cancel (only) for running and queued jobs', async () => {
        const user = userEvent.setup();
        const handlers = renderCard(makeJob({ status: 'running' }));
        await user.click(screen.getByRole('button', { name: 'CANCEL' }));
        expect(handlers.onCancel).toHaveBeenCalledWith('job-1');
        expect(screen.queryByRole('button', { name: 'REMOVE' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'RETRY' })).not.toBeInTheDocument();
    });

    it('offers cancel for queued jobs', () => {
        renderCard(makeJob({ status: 'queued' }));
        expect(screen.getByText('QUEUED')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'CANCEL' })).toBeInTheDocument();
    });

    it('offers show file and remove for done jobs', async () => {
        const user = userEvent.setup();
        const handlers = renderCard(makeJob({ status: 'done', percent: 100, filePath: '/d/Some Video.mp4' }));
        expect(screen.getByText('COMPLETE')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'SHOW FILE' }));
        expect(handlers.onShowFile).toHaveBeenCalledWith('/d/Some Video.mp4');
        await user.click(screen.getByRole('button', { name: 'REMOVE' }));
        expect(handlers.onRemove).toHaveBeenCalledWith('job-1');
        expect(screen.queryByRole('button', { name: 'CANCEL' })).not.toBeInTheDocument();
    });

    it('does not offer show file for a done job without a path', () => {
        renderCard(makeJob({ status: 'done', filePath: null }));
        expect(screen.queryByRole('button', { name: 'SHOW FILE' })).not.toBeInTheDocument();
    });

    it('shows the error banner and retries through it for failed jobs', async () => {
        const user = userEvent.setup();
        const handlers = renderCard(makeJob({ status: 'error', error: ERROR }));
        expect(screen.getByText('FAILED')).toBeInTheDocument();
        expect(screen.getByRole('alert')).toHaveTextContent('Video unavailable');
        expect(screen.getAllByRole('button', { name: 'RETRY' })).toHaveLength(1);
        await user.click(screen.getByRole('button', { name: 'RETRY' }));
        expect(handlers.onRetry).toHaveBeenCalledWith('job-1');
        await user.click(screen.getByRole('button', { name: 'REMOVE' }));
        expect(handlers.onRemove).toHaveBeenCalledWith('job-1');
    });

    it('offers a retry button for cancelled jobs without an error', async () => {
        const user = userEvent.setup();
        const handlers = renderCard(makeJob({ status: 'cancelled' }));
        expect(screen.getByText('CANCELLED')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'RETRY' }));
        expect(handlers.onRetry).toHaveBeenCalledWith('job-1');
    });

    describe('stream finder', () => {
        it('offers FIND STREAM for a page yt-dlp did not understand and starts the search', async () => {
            renderCard(makeJob({ status: 'error', error: UNSUPPORTED }));
            await userEvent.setup().click(screen.getByRole('button', { name: 'FIND STREAM' }));
            expect(mock.api.findStreams).toHaveBeenCalledWith('job-1', false);
            expect(useAppStore.getState().streamSearches['job-1']?.status).toMatch(/searching|done/);
        });

        it('does not offer it for failures a page scan cannot fix', () => {
            renderCard(makeJob({ status: 'error', error: ERROR }));
            expect(screen.queryByRole('button', { name: 'FIND STREAM' })).not.toBeInTheDocument();
        });

        it('does not offer it again while a search panel is open, and shows the panel', () => {
            useAppStore.setState({
                streamSearches: { 'job-1': { status: 'searching', stage: 'scanning', candidates: [], message: null, usedBrowser: false } }
            });
            renderCard(makeJob({ status: 'error', error: UNSUPPORTED }));
            expect(screen.queryByRole('button', { name: 'FIND STREAM' })).not.toBeInTheDocument();
            expect(screen.getByRole('region', { name: 'Stream finder' })).toBeInTheDocument();
        });

        it('shows no panel for jobs without a search', () => {
            renderCard(makeJob({ status: 'error', error: UNSUPPORTED }));
            expect(screen.queryByRole('region', { name: 'Stream finder' })).not.toBeInTheDocument();
        });
    });
});
