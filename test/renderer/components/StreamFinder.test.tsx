// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StreamCandidate } from '@shared/types';
import { StreamFinder } from '@renderer/components/StreamFinder';
import { useAppStore, type StreamSearchState } from '@renderer/store/appStore';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';

let mock: MockApiHandle;
const initial = useAppStore.getState();

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initial, streamSearches: {}, notice: null });
});

function candidate(overrides: Partial<StreamCandidate> = {}): StreamCandidate {
    return { id: 'c1', url: 'https://cdn.test/v/master.m3u8', kind: 'hls', source: 'page', host: 'cdn.test', title: 'Episode 1', ...overrides };
}

function setSearch(search: Partial<StreamSearchState>): void {
    useAppStore.setState({
        streamSearches: { 'job-1': { status: 'done', stage: 'scanning', candidates: [], message: null, usedBrowser: false, ...search } }
    });
}

describe('StreamFinder', () => {
    it('renders nothing when the job has no search', () => {
        const { container } = render(<StreamFinder jobId="job-1" />);
        expect(container).toBeEmptyDOMElement();
    });

    it.each([
        ['scanning', 'Scanning the page for video links…'],
        ['watching', 'Watching the page’s network activity (up to 25 s)…']
    ] as const)('shows the %s stage while searching and lets the user cancel', async (stage, text) => {
        setSearch({ status: 'searching', stage });
        render(<StreamFinder jobId="job-1" />);
        expect(screen.getByRole('status')).toHaveTextContent(text);
        await userEvent.setup().click(screen.getByRole('button', { name: 'CANCEL' }));
        expect(mock.api.cancelStreamFind).toHaveBeenCalledWith('job-1');
    });

    it('explains that nothing was found', () => {
        setSearch({ message: 'No video stream was found.' });
        render(<StreamFinder jobId="job-1" />);
        expect(screen.getByRole('status')).toHaveTextContent('No video stream was found.');
        expect(screen.queryByRole('button', { name: /DOWNLOAD|SEARCH DEEPER/ })).not.toBeInTheDocument();
    });

    it('lists the candidates with their type, address, host and origin', () => {
        setSearch({
            candidates: [candidate(), candidate({ id: 'c2', url: 'https://cdn.test/clip.mp4', kind: 'mp4', source: 'network' }), candidate({ id: 'c3', url: 'https://x.test/v', kind: 'other', host: 'x.test' })]
        });
        render(<StreamFinder jobId="job-1" />);
        expect(screen.getByText('Pick the stream to download (3 found):')).toBeInTheDocument();
        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(3);
        expect(within(items[0] as HTMLElement).getByText('HLS')).toBeInTheDocument();
        expect(within(items[0] as HTMLElement).getByText('https://cdn.test/v/master.m3u8')).toHaveAttribute('title', 'https://cdn.test/v/master.m3u8');
        expect(within(items[0] as HTMLElement).getByText('cdn.test · found in the page')).toBeInTheDocument();
        expect(within(items[1] as HTMLElement).getByText('MP4')).toBeInTheDocument();
        expect(within(items[1] as HTMLElement).getByText('cdn.test · seen on the network')).toBeInTheDocument();
        expect(within(items[2] as HTMLElement).getByText('VIDEO')).toBeInTheDocument();
    });

    it.each([
        ['dash', 'DASH'],
        ['webm', 'WEBM']
    ] as const)('labels %s streams', (kind, label) => {
        setSearch({ candidates: [candidate({ kind })] });
        render(<StreamFinder jobId="job-1" />);
        expect(screen.getByText(label)).toBeInTheDocument();
    });

    it('downloads the chosen candidate and closes the panel', async () => {
        setSearch({ candidates: [candidate(), candidate({ id: 'c2', url: 'https://cdn.test/clip.mp4', kind: 'mp4' })] });
        render(<StreamFinder jobId="job-1" />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Download stream 2' }));
        expect(mock.api.downloadStream).toHaveBeenCalledWith('c2');
        await vi.waitFor(() => {
            expect(useAppStore.getState().streamSearches['job-1']).toBeUndefined();
        });
    });

    it('keeps the panel and shows the error when the download could not be added', async () => {
        mock.api.downloadStream.mockResolvedValueOnce({ ok: false, job: null, message: 'That stream is no longer available. Search again.' });
        setSearch({ candidates: [candidate()] });
        render(<StreamFinder jobId="job-1" />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Download stream 1' }));
        await vi.waitFor(() => {
            expect(useAppStore.getState().notice).toEqual({ kind: 'error', message: 'That stream is no longer available. Search again.' });
        });
        expect(useAppStore.getState().streamSearches['job-1']).toBeDefined();
    });

    it('offers a deeper search after a static result and runs it', async () => {
        setSearch({ candidates: [candidate()], usedBrowser: false });
        render(<StreamFinder jobId="job-1" />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'NOT THE ONE? SEARCH DEEPER' }));
        expect(mock.api.findStreams).toHaveBeenCalledWith('job-1', true);
    });

    it('does not offer a deeper search after the browser already looked', () => {
        setSearch({ candidates: [candidate()], usedBrowser: true });
        render(<StreamFinder jobId="job-1" />);
        expect(screen.queryByRole('button', { name: 'NOT THE ONE? SEARCH DEEPER' })).not.toBeInTheDocument();
    });

    it('closes the panel and cancels any running search', async () => {
        setSearch({ status: 'searching' });
        render(<StreamFinder jobId="job-1" />);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Close stream finder' }));
        expect(mock.api.cancelStreamFind).toHaveBeenCalledWith('job-1');
        expect(useAppStore.getState().streamSearches['job-1']).toBeUndefined();
    });

    it('always reminds that DRM streams cannot be downloaded', () => {
        setSearch({ message: 'nothing' });
        render(<StreamFinder jobId="job-1" />);
        expect(screen.getByText('Protected (DRM) streams cannot be downloaded. Only download what you have the right to.')).toBeInTheDocument();
    });
});
