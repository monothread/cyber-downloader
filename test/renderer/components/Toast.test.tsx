// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast } from '@renderer/components/Toast';
import { useAppStore } from '@renderer/store/appStore';

const initial = useAppStore.getState();

beforeEach(() => {
    useAppStore.setState({ ...initial, notice: null });
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

    it('dismisses the notice', async () => {
        useAppStore.setState({ notice: { kind: 'info', message: 'Saved' } });
        render(<Toast />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss notification' }));
        expect(useAppStore.getState().notice).toBeNull();
        expect(screen.queryByText('Saved')).not.toBeInTheDocument();
    });
});
