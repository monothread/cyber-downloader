// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { QueueList } from '@renderer/components/QueueList';
import { useAppStore } from '@renderer/store/appStore';
import { installMockApi, makeJob, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initial, jobs: [], settings: DEFAULT_SETTINGS });
});

describe('QueueList', () => {
    it('shows an empty state without jobs', () => {
        render(<QueueList />);
        expect(screen.getByText('// NO ACTIVE DOWNLOADS. JACK IN A URL ABOVE.')).toBeInTheDocument();
    });

    it('renders a card per job and the count', () => {
        useAppStore.setState({ jobs: [makeJob({ id: 'a', title: 'First' }), makeJob({ id: 'b', title: 'Second' })] });
        render(<QueueList />);
        expect(screen.getByText('QUEUE [2]')).toBeInTheDocument();
        expect(screen.getAllByTestId('job-card')).toHaveLength(2);
        expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument();
    });

    it('hides clear finished while every job is active', () => {
        useAppStore.setState({ jobs: [makeJob({ status: 'running' }), makeJob({ id: 'q', status: 'queued' })] });
        render(<QueueList />);
        expect(screen.queryByRole('button', { name: 'CLEAR FINISHED' })).not.toBeInTheDocument();
    });

    it.each(['done', 'error', 'cancelled'] as const)('shows clear finished when a job is %s', async (status) => {
        useAppStore.setState({ jobs: [makeJob({ status })] });
        render(<QueueList />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'CLEAR FINISHED' }));
        expect(mock.api.clearFinished).toHaveBeenCalledTimes(1);
    });

    it('wires card actions to the API', async () => {
        const user = userEvent.setup();
        useAppStore.setState({
            jobs: [
                makeJob({ id: 'run', status: 'running' }),
                makeJob({ id: 'done', status: 'done', filePath: '/d/x.mp4' }),
                makeJob({ id: 'cancelled', status: 'cancelled' })
            ]
        });
        render(<QueueList />);
        const cards = screen.getAllByTestId('job-card');
        await user.click(within(cards[0] as HTMLElement).getByRole('button', { name: 'CANCEL' }));
        expect(mock.api.cancelJob).toHaveBeenCalledWith('run');
        await user.click(within(cards[1] as HTMLElement).getByRole('button', { name: 'SHOW FILE' }));
        expect(mock.api.showItemInFolder).toHaveBeenCalledWith('/d/x.mp4');
        await user.click(within(cards[1] as HTMLElement).getByRole('button', { name: 'REMOVE' }));
        expect(mock.api.removeJob).toHaveBeenCalledWith('done');
        await user.click(within(cards[2] as HTMLElement).getByRole('button', { name: 'RETRY' }));
        expect(mock.api.retryJob).toHaveBeenCalledWith('cancelled');
    });

    it('wires STOP & SAVE of a live recording to the API', async () => {
        useAppStore.setState({ jobs: [makeJob({ id: 'live-1', status: 'running', live: true, elapsedSeconds: 5, downloadedBytes: 1024 })] });
        render(<QueueList />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'STOP & SAVE' }));
        expect(mock.api.stopJob).toHaveBeenCalledWith('live-1');
        expect(mock.api.cancelJob).not.toHaveBeenCalled();
    });
});
