// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { createTranslator } from '@shared/i18n';
import { JobMeta, JobProgress } from '@renderer/components/JobProgress';
import { makeJob } from '../../helpers/mockApi';

const t = createTranslator('en');
const END_CHECK = { secondsLeft: 4, totalSeconds: 10 };

describe('JobProgress', () => {
    it('shows a percentage bar for an ordinary download', () => {
        render(<JobProgress job={makeJob({ percent: 42.5 })} phase={null} t={t} />);
        const bar = screen.getByRole('progressbar', { name: 'Download progress' });
        expect(bar).toHaveAttribute('aria-valuenow', '43');
        expect(bar).toHaveAttribute('aria-valuemin', '0');
        expect(bar).toHaveAttribute('aria-valuemax', '100');
        expect(bar.firstElementChild).toHaveStyle({ width: '42.5%' });
    });

    it('shows the striped bar while a live stream is recorded', () => {
        render(<JobProgress job={makeJob({ live: true })} phase={null} t={t} />);
        expect(screen.getByRole('progressbar', { name: 'Recording a live stream' })).toHaveClass('progress--live');
    });

    it('shows a bar that drains over the checking time while the end of a stream is checked', () => {
        render(<JobProgress job={makeJob({ live: true, endCheck: END_CHECK })} phase="verifying" t={t} />);
        const bar = screen.getByRole('progressbar', { name: 'Checking whether the live stream really ended' });
        expect(bar).toHaveClass('progress', 'progress--verify');
        expect(bar).toHaveAttribute('aria-valuenow', '4');
        expect(bar).toHaveAttribute('aria-valuemax', '10');
        expect(bar.firstElementChild).toHaveStyle({ animationDuration: '10s' });
    });

    it('falls back to the normal bar when it is verifying but there is no check data', () => {
        render(<JobProgress job={makeJob({ live: false, endCheck: null })} phase="verifying" t={t} />);
        expect(screen.getByRole('progressbar', { name: 'Download progress' })).toBeInTheDocument();
    });

    it('shows a sweeping bar while waiting for a scheduled live stream', () => {
        render(<JobProgress job={makeJob({ waitingForLive: true })} phase="waiting" t={t} />);
        const bar = screen.getByRole('progressbar', { name: 'Waiting for the live stream to start' });
        expect(bar).toHaveClass('progress', 'progress--waiting');
        expect(bar).not.toHaveAttribute('aria-valuenow');
    });

    it('is not live once the job finished', () => {
        render(<JobProgress job={makeJob({ live: true, status: 'done', percent: 100 })} phase={null} t={t} />);
        expect(screen.getByRole('progressbar', { name: 'Download progress' })).toHaveAttribute('aria-valuenow', '100');
    });
});

describe('JobMeta', () => {
    it('shows the percentage, the speed and the ETA of an ordinary download', () => {
        render(<JobMeta job={makeJob({ percent: 10, speed: '2MiB/s', eta: '00:30' })} phase={null} t={t} />);
        expect(screen.getByText('10.0%')).toBeInTheDocument();
        expect(screen.getByText('2MiB/s')).toBeInTheDocument();
        expect(screen.getByText('ETA 00:30')).toBeInTheDocument();
    });

    it('omits the speed and the ETA when they are empty', () => {
        render(<JobMeta job={makeJob({ speed: '', eta: '' })} phase={null} t={t} />);
        expect(screen.queryByText(/ETA/)).not.toBeInTheDocument();
        expect(screen.getByText('42.5%')).toBeInTheDocument();
    });

    it('shows the time and the size of a recording', () => {
        render(<JobMeta job={makeJob({ live: true, elapsedSeconds: 65, downloadedBytes: 2048 })} phase={null} t={t} />);
        expect(screen.getByText('● LIVE')).toBeInTheDocument();
        expect(screen.getByText('01:05')).toBeInTheDocument();
        expect(screen.getByText('2.0 KiB')).toBeInTheDocument();
    });

    it('counts the seconds that are left while the end of a stream is checked', () => {
        render(<JobMeta job={makeJob({ live: true, endCheck: END_CHECK })} phase="verifying" t={t} />);
        expect(screen.getByText('The stream stopped. Checking whether it really ended… 4s')).toHaveClass('job__verifying');
        expect(screen.queryByText('● LIVE')).not.toBeInTheDocument();
    });

    it('says that it is waiting for the stream to start', () => {
        render(<JobMeta job={makeJob({ waitingForLive: true })} phase="waiting" t={t} />);
        expect(screen.getByText('Waiting for the live stream to start')).toHaveClass('job__waiting');
        expect(screen.queryByText('42.5%')).not.toBeInTheDocument();
    });
});
