// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { EMPTY_LINKS_MESSAGE, UrlInput } from '@renderer/components/UrlInput';
import { useAppStore } from '@renderer/store/appStore';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initial, settings: DEFAULT_SETTINGS, notice: null });
});

function link(index: number): HTMLInputElement {
    return screen.getByLabelText(`Link ${index}`) as HTMLInputElement;
}

async function submit(): Promise<void> {
    await userEvent.setup().click(screen.getByRole('button', { name: 'DOWNLOAD' }));
}

describe('UrlInput layout', () => {
    it('starts with a single empty link row and the action buttons', () => {
        render(<UrlInput />);
        expect(link(1)).toHaveValue('');
        expect(screen.queryByLabelText('Link 2')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '+ ADD LINK' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'DOWNLOAD' })).toBeInTheDocument();
        expect(screen.getByLabelText('AUDIO ONLY')).not.toBeChecked();
    });

    it('uses a single-line, non-resizable text input instead of a textarea', () => {
        const { container } = render(<UrlInput />);
        expect(container.querySelector('textarea')).toBeNull();
        expect(link(1).tagName).toBe('INPUT');
        expect(link(1)).toHaveAttribute('type', 'text');
        expect(link(1)).toHaveAttribute('inputmode', 'url');
    });

    it('does not show a remove button while there is only one row', () => {
        render(<UrlInput />);
        expect(screen.queryByRole('button', { name: /Remove link/ })).not.toBeInTheDocument();
    });
});

describe('UrlInput rows', () => {
    it('adds a new empty row and focuses it', async () => {
        render(<UrlInput />);
        await userEvent.setup().click(screen.getByRole('button', { name: '+ ADD LINK' }));
        expect(link(2)).toHaveValue('');
        expect(link(2)).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Remove link 1' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Remove link 2' })).toBeInTheDocument();
    });

    it('can add several rows', async () => {
        const user = userEvent.setup();
        render(<UrlInput />);
        await user.click(screen.getByRole('button', { name: '+ ADD LINK' }));
        await user.click(screen.getByRole('button', { name: '+ ADD LINK' }));
        expect(screen.getAllByLabelText(/^Link \d$/)).toHaveLength(3);
    });

    it('removes the chosen row and keeps the values of the others', async () => {
        const user = userEvent.setup();
        render(<UrlInput />);
        await user.click(screen.getByRole('button', { name: '+ ADD LINK' }));
        await user.click(screen.getByRole('button', { name: '+ ADD LINK' }));
        fireEvent.change(link(1), { target: { value: 'https://a.com' } });
        fireEvent.change(link(2), { target: { value: 'https://b.com' } });
        fireEvent.change(link(3), { target: { value: 'https://c.com' } });
        await user.click(screen.getByRole('button', { name: 'Remove link 2' }));
        expect(screen.getAllByLabelText(/^Link \d$/)).toHaveLength(2);
        expect(link(1)).toHaveValue('https://a.com');
        expect(link(2)).toHaveValue('https://c.com');
        expect(screen.queryByRole('button', { name: 'Remove link 2' })).toBeInTheDocument();
    });

    it('hides the remove buttons again when a single row is left', async () => {
        const user = userEvent.setup();
        render(<UrlInput />);
        await user.click(screen.getByRole('button', { name: '+ ADD LINK' }));
        await user.click(screen.getByRole('button', { name: 'Remove link 2' }));
        expect(screen.queryByRole('button', { name: /Remove link/ })).not.toBeInTheDocument();
    });
});

describe('UrlInput long links', () => {
    it('keeps a very long link intact, exposes it as a tooltip and sends it whole', async () => {
        const longUrl = `https://example.com/watch?v=abc&list=${'x'.repeat(2000)}`;
        render(<UrlInput />);
        fireEvent.change(link(1), { target: { value: longUrl } });
        expect(link(1)).toHaveValue(longUrl);
        expect(link(1)).toHaveAttribute('title', longUrl);
        await submit();
        await waitFor(() => {
            expect(mock.api.addDownload).toHaveBeenCalledWith(longUrl);
        });
    });
});

describe('UrlInput submit', () => {
    it('sends every non-empty link trimmed, in order, and resets to a single empty row', async () => {
        const user = userEvent.setup();
        render(<UrlInput />);
        await user.click(screen.getByRole('button', { name: '+ ADD LINK' }));
        await user.click(screen.getByRole('button', { name: '+ ADD LINK' }));
        fireEvent.change(link(1), { target: { value: '  https://a.com  ' } });
        fireEvent.change(link(3), { target: { value: 'https://c.com' } });
        await user.click(screen.getByRole('button', { name: 'DOWNLOAD' }));
        await waitFor(() => {
            expect(mock.api.addDownload.mock.calls).toEqual([['https://a.com'], ['https://c.com']]);
        });
        await waitFor(() => {
            expect(screen.queryByLabelText('Link 2')).not.toBeInTheDocument();
        });
        expect(link(1)).toHaveValue('');
    });

    it('submits with Enter from a link field', async () => {
        render(<UrlInput />);
        fireEvent.change(link(1), { target: { value: 'https://a.com' } });
        await userEvent.setup().type(link(1), '{Enter}');
        await waitFor(() => {
            expect(mock.api.addDownload).toHaveBeenCalledWith('https://a.com');
        });
    });

    it('shows an error on the first row when everything is empty and does not call the API', async () => {
        render(<UrlInput />);
        await submit();
        expect(await screen.findByRole('alert')).toHaveTextContent(EMPTY_LINKS_MESSAGE);
        expect(link(1)).toHaveAttribute('aria-invalid', 'true');
        expect(mock.api.addDownload).not.toHaveBeenCalled();
    });

    it('clears the row error as soon as the user types', async () => {
        render(<UrlInput />);
        await submit();
        await screen.findByRole('alert');
        fireEvent.change(link(1), { target: { value: 'h' } });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(link(1)).toHaveAttribute('aria-invalid', 'false');
    });

    it('keeps only the rejected links, with their error message, and clears the accepted ones', async () => {
        mock.api.addDownload.mockResolvedValueOnce({ ok: true, job: null, message: null });
        mock.api.addDownload.mockResolvedValueOnce({ ok: false, job: null, message: 'Invalid URL. Use an http(s) link.' });
        const user = userEvent.setup();
        render(<UrlInput />);
        await user.click(screen.getByRole('button', { name: '+ ADD LINK' }));
        fireEvent.change(link(1), { target: { value: 'https://ok.com' } });
        fireEvent.change(link(2), { target: { value: 'not-a-url' } });
        await user.click(screen.getByRole('button', { name: 'DOWNLOAD' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Invalid URL. Use an http(s) link.');
        expect(screen.getAllByLabelText(/^Link \d$/)).toHaveLength(1);
        expect(link(1)).toHaveValue('not-a-url');
        expect(link(1)).toHaveAttribute('aria-invalid', 'true');
    });

    it('uses a generic message when a rejection has no message', async () => {
        mock.api.addDownload.mockResolvedValueOnce({ ok: false, job: null, message: null });
        render(<UrlInput />);
        fireEvent.change(link(1), { target: { value: 'https://x.com' } });
        await submit();
        expect(await screen.findByRole('alert')).toHaveTextContent('Could not add the download.');
    });

    it('shows a separate error for each rejected link', async () => {
        mock.api.addDownload.mockResolvedValueOnce({ ok: false, job: null, message: 'first bad' });
        mock.api.addDownload.mockResolvedValueOnce({ ok: false, job: null, message: 'second bad' });
        const user = userEvent.setup();
        render(<UrlInput />);
        await user.click(screen.getByRole('button', { name: '+ ADD LINK' }));
        fireEvent.change(link(1), { target: { value: 'bad-1' } });
        fireEvent.change(link(2), { target: { value: 'bad-2' } });
        await user.click(screen.getByRole('button', { name: 'DOWNLOAD' }));
        await waitFor(() => {
            expect(screen.getAllByRole('alert').map((alert) => {
                return alert.textContent;
            })).toEqual(['first bad', 'second bad']);
        });
        expect(link(1)).toHaveValue('bad-1');
        expect(link(2)).toHaveValue('bad-2');
    });
});

describe('UrlInput audio toggle', () => {
    it('reflects the stored audio-only setting', () => {
        useAppStore.setState({ settings: { ...DEFAULT_SETTINGS, audioOnly: true } });
        render(<UrlInput />);
        expect(screen.getByLabelText('AUDIO ONLY')).toBeChecked();
    });

    it('saves the settings when the toggle changes', async () => {
        render(<UrlInput />);
        await userEvent.setup().click(screen.getByLabelText('AUDIO ONLY'));
        await waitFor(() => {
            expect(mock.api.saveSettings).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, audioOnly: true });
        });
    });
});
