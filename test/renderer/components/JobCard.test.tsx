// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DownloadError, DownloadJob } from '@shared/types';
import { JobCard } from '@renderer/components/JobCard';
import { makeJob } from '../../helpers/mockApi';

const ERROR: DownloadError = { code: 'UNAVAILABLE', title: 'Video unavailable', hint: 'Maybe private.', raw: 'ERROR: gone' };

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
});
