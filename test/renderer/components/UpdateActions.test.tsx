// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateActions } from '@renderer/components/UpdateActions';
import { INITIAL_APP_UPDATE, useAppStore } from '@renderer/store/appStore';
import { APP_UPDATE_IDLE, installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initial, appUpdate: INITIAL_APP_UPDATE });
});

describe('UpdateActions', () => {
    it.each(['idle', 'checking', 'downloading', 'not-available', 'error', 'unsupported'] as const)('renders nothing when %s', (status) => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, status } });
        const { container } = render(<UpdateActions />);
        expect(container).toBeEmptyDOMElement();
    });

    it('starts the download when an update is available', async () => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, status: 'available', version: '0.2.0' } });
        render(<UpdateActions />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'UPDATE TO 0.2.0' }));
        expect(mock.api.downloadAppUpdate).toHaveBeenCalledTimes(1);
        expect(mock.api.installAppUpdate).not.toHaveBeenCalled();
    });

    it('installs when the update was downloaded', async () => {
        useAppStore.setState({ appUpdate: { ...APP_UPDATE_IDLE, status: 'downloaded', version: '0.2.0' } });
        render(<UpdateActions />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'RESTART & INSTALL' }));
        expect(mock.api.installAppUpdate).toHaveBeenCalledTimes(1);
        expect(mock.api.downloadAppUpdate).not.toHaveBeenCalled();
    });
});
