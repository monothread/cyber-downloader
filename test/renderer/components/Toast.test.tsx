// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from '@testing-library/react';
import { INFO_NOTICE_MS, Toast } from '@renderer/components/Toast';
import { useAppStore } from '@renderer/store/appStore';

const initial = useAppStore.getState();

beforeEach(() => {
    useAppStore.setState({ ...initial, notice: null, noticeQueue: [] });
});

describe('Toast', () => {
    it('renders nothing without a notice', () => {
        const { container } = render(<Toast />);
        expect(container).toBeEmptyDOMElement();
    });

    it('renders an error notice as an alert', () => {
        useAppStore.setState({ notice: { kind: 'error', message: 'Boom' } });
        render(<Toast />);
        expect(screen.getByRole('alert')).toHaveTextContent('Boom');
        expect(screen.getByRole('alert')).toHaveClass('toast--error');
    });

    it('renders an info notice as a status', () => {
        useAppStore.setState({ notice: { kind: 'info', message: 'Saved' } });
        render(<Toast />);
        expect(screen.getByRole('status')).toHaveTextContent('Saved');
        expect(screen.getByRole('status')).toHaveClass('toast--info');
    });

    describe('going away by itself', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('removes an info notice after five seconds', () => {
            expect(INFO_NOTICE_MS).toBe(5000);
            useAppStore.setState({ notice: { kind: 'info', message: 'Queued' } });
            render(<Toast />);

            act(() => {
                vi.advanceTimersByTime(INFO_NOTICE_MS - 1);
            });
            expect(screen.getByText('Queued')).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(useAppStore.getState().notice).toBeNull();
            expect(screen.queryByText('Queued')).not.toBeInTheDocument();
        });

        it('keeps an error notice until it is dismissed', () => {
            useAppStore.setState({ notice: { kind: 'error', message: 'Boom' } });
            render(<Toast />);
            act(() => {
                vi.advanceTimersByTime(INFO_NOTICE_MS * 10);
            });
            expect(screen.getByText('Boom')).toBeInTheDocument();
            expect(useAppStore.getState().notice).toEqual({ kind: 'error', message: 'Boom' });
        });

        it('counts the five seconds again when a new notice replaces the old one', () => {
            useAppStore.setState({ notice: { kind: 'info', message: 'First' } });
            render(<Toast />);
            act(() => {
                vi.advanceTimersByTime(INFO_NOTICE_MS - 1000);
            });
            act(() => {
                useAppStore.setState({ notice: { kind: 'info', message: 'Second' } });
            });
            act(() => {
                vi.advanceTimersByTime(INFO_NOTICE_MS - 1000);
            });
            expect(screen.getByText('Second')).toBeInTheDocument();
            act(() => {
                vi.advanceTimersByTime(1000);
            });
            expect(screen.queryByText('Second')).not.toBeInTheDocument();
        });

        it('shows the queued notices one after the other, five seconds each', () => {
            render(<Toast />);
            act(() => {
                useAppStore.getState().queueNotice({ kind: 'info', message: 'One' });
                useAppStore.getState().queueNotice({ kind: 'info', message: 'Two' });
            });
            expect(screen.getByText('One')).toBeInTheDocument();
            expect(screen.queryByText('Two')).not.toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(INFO_NOTICE_MS);
            });
            expect(screen.queryByText('One')).not.toBeInTheDocument();
            expect(screen.getByText('Two')).toBeInTheDocument();

            act(() => {
                vi.advanceTimersByTime(INFO_NOTICE_MS - 1);
            });
            expect(screen.getByText('Two')).toBeInTheDocument();
            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(screen.queryByText('Two')).not.toBeInTheDocument();
            expect(useAppStore.getState().notice).toBeNull();
        });

        it('does not clear a newer error when the timer of an older info notice fires', () => {
            useAppStore.setState({ notice: { kind: 'info', message: 'Info' } });
            render(<Toast />);
            act(() => {
                useAppStore.setState({ notice: { kind: 'error', message: 'Boom' } });
            });
            act(() => {
                vi.advanceTimersByTime(INFO_NOTICE_MS * 2);
            });
            expect(screen.getByText('Boom')).toBeInTheDocument();
        });

        it('stops the timer when the notice is dismissed by hand', () => {
            useAppStore.setState({ notice: { kind: 'info', message: 'Saved' } });
            render(<Toast />);
            act(() => {
                useAppStore.getState().setNotice(null);
            });
            act(() => {
                useAppStore.getState().setNotice({ kind: 'error', message: 'Later error' });
                vi.advanceTimersByTime(INFO_NOTICE_MS * 2);
            });
            expect(screen.getByText('Later error')).toBeInTheDocument();
        });
    });

    it('dismisses the notice', async () => {
        useAppStore.setState({ notice: { kind: 'info', message: 'Saved' } });
        render(<Toast />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss notification' }));
        expect(useAppStore.getState().notice).toBeNull();
        expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    });
});
