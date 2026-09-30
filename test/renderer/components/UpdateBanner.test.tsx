// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { UpdateBanner } from '@renderer/components/UpdateBanner';
import { INITIAL_APP_UPDATE, useAppStore } from '@renderer/store/appStore';
import { APP_UPDATE_IDLE, installMockApi } from '../../helpers/mockApi';

const initial = useAppStore.getState();

beforeEach(() => {
    installMockApi();
    useAppStore.setState({ ...initial, appUpdate: INITIAL_APP_UPDATE });
});

describe('UpdateBanner', () => {
    it.each(['idle', 'checking', 'not-available', 'error', 'unsupported'] as const)('is hidden when %s', (status) => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, status, message: 'x' } });
        const { container } = render(<UpdateBanner />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the available version with its action', () => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, status: 'available', version: '0.2.0' } });
        render(<UpdateBanner />);
        expect(screen.getByRole('status')).toHaveTextContent('Version 0.2.0 is available.');
        expect(screen.getByRole('button', { name: 'UPDATE TO 0.2.0' })).toBeInTheDocument();
    });

    it('shows the download progress without an action', () => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, status: 'downloading', version: '0.2.0', percent: 55.5 } });
        render(<UpdateBanner />);
        expect(screen.getByRole('status')).toHaveTextContent('Downloading version 0.2.0… 55.5%');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('offers restart and install when downloaded', () => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, status: 'downloaded', version: '0.2.0' } });
        render(<UpdateBanner />);
        expect(screen.getByRole('status')).toHaveTextContent('Version 0.2.0 is ready to install.');
        expect(screen.getByRole('button', { name: 'RESTART & INSTALL' })).toBeInTheDocument();
    });
});
