// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { UrlInput } from '@renderer/components/UrlInput';
import { useAppStore } from '@renderer/store/appStore';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initial, settings: DEFAULT_SETTINGS, notice: null });
});

describe('UrlInput', () => {
    it('renders the field, the audio toggle and the submit button', () => {
        render(<UrlInput />);
        expect(screen.getByLabelText('TARGET URL(S)')).toHaveValue('');
        expect(screen.getByLabelText('AUDIO ONLY')).not.toBeChecked();
        expect(screen.getByRole('button', { name: 'DOWNLOAD' })).toBeInTheDocument();
    });

    it('submits every pasted URL and clears the field', async () => {
        const user = userEvent.setup();
        render(<UrlInput />);
        await user.type(screen.getByLabelText('TARGET URL(S)'), 'https://a.com https://b.com');
        await user.click(screen.getByRole('button', { name: 'DOWNLOAD' }));
        await waitFor(() => {
            expect(mock.api.addDownload.mock.calls).toEqual([['https://a.com'], ['https://b.com']]);
        });
        await waitFor(() => {
            expect(screen.getByLabelText('TARGET URL(S)')).toHaveValue('');
        });
    });

    it('sets an error notice when submitting an empty field', async () => {
        render(<UrlInput />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'DOWNLOAD' }));
        await waitFor(() => {
            expect(useAppStore.getState().notice).toEqual({ kind: 'error', message: 'Paste at least one video URL.' });
        });
        expect(mock.api.addDownload).not.toHaveBeenCalled();
    });

    it('reflects the stored audio-only setting', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, audioOnly: true } });
        render(<UrlInput />);
        expect(screen.getByLabelText('AUDIO ONLY')).toBeChecked();
    });

    it('saves the settings when the audio-only toggle changes', async () => {
        render(<UrlInput />);
        await userEvent.setup().click(screen.getByLabelText('AUDIO ONLY'));
        await waitFor(() => {
            expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, audioOnly: true });
        });
    });
});
