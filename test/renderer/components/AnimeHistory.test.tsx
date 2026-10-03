// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnimeHistoryEntry } from '@shared/anime';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { AnimeHistory } from '@renderer/components/AnimeHistory';
import { INITIAL_SEARCH, useAnimeStore } from '@renderer/store/animeStore';
import { useAppStore } from '@renderer/store/appStore';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';

const initialApp = useAppStore.getState();
const initialAnime = useAnimeStore.getState();
let mock: MockApiHandle;

const OPENED: AnimeHistoryEntry = { id: 1, title: 'Naruto', query: 'naruto', searchIndex: 2, audio: 'dub', episode: null, openedAt: 1700000000000 };
const WATCHED: AnimeHistoryEntry = { id: 2, title: 'Bleach', query: 'bleach', searchIndex: 4, audio: 'sub', episode: '12', openedAt: 1700000001000 };

beforeEach(() => {
    mock = installMockApi();
    useAppStore.setState({ ...initialApp, settings: DEFAULT_SETTINGS });
    useAnimeStore.setState({ ...initialAnime, view: 'history', returnView: 'history', history: [], library: [], search: INITIAL_SEARCH, selection: null });
});

describe('AnimeHistory', () => {
    it('shows an empty state and nothing else', () => {
        render(<AnimeHistory />);
        expect(screen.getByText('// NOTHING OPENED YET. SEARCH AN ANIME OR PLAY AN EPISODE.')).toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Anime history' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'CLEAR HISTORY' })).not.toBeInTheDocument();
    });

    it('lists the anime in the order of the store with the count, the audio, the last episode and the time', () => {
        useAnimeStore.setState({ history: [WATCHED, OPENED] });
        render(<AnimeHistory />);

        expect(screen.getByRole('region', { name: 'Anime history' })).toBeInTheDocument();
        expect(screen.getByText('HISTORY [2]')).toBeInTheDocument();
        const items = screen.getAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(within(items[0] as HTMLElement).getByText('Bleach')).toHaveAttribute('title', 'Bleach');
        expect(within(items[0] as HTMLElement).getByText(/^SUB · EP 12 · /)).toBeInTheDocument();
        expect(within(items[0] as HTMLElement).getByText(new RegExp(new Date(WATCHED.openedAt).toLocaleString('en').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).toBeInTheDocument();
        expect(within(items[1] as HTMLElement).getByText('Naruto')).toBeInTheDocument();
        expect(within(items[1] as HTMLElement).getByText(/^DUB · /)).toBeInTheDocument();
        expect(within(items[1] as HTMLElement).queryByText(/EP /)).not.toBeInTheDocument();
    });

    it('opens an entry in the search with its episodes', async () => {
        const user = userEvent.setup();
        mock.api.listAnimeEpisodes.mockResolvedValue({ ok: true, episodes: ['1', '2'] });
        useAnimeStore.setState({ history: [WATCHED, OPENED] });
        render(<AnimeHistory />);

        await user.click(screen.getByRole('button', { name: 'OPEN: Naruto' }));
        expect(mock.api.listAnimeEpisodes).toHaveBeenCalledWith('naruto', 2, 'dub');
        expect(useAnimeStore.getState()).toMatchObject({
            view: 'search',
            selection: { result: { index: 2, title: 'Naruto' }, query: 'naruto', audio: 'dub', status: 'ready', episodes: ['1', '2'] }
        });
    });

    it('removes one entry', async () => {
        const user = userEvent.setup();
        mock.api.listAnimeHistory.mockResolvedValue([OPENED]);
        useAnimeStore.setState({ history: [WATCHED, OPENED] });
        render(<AnimeHistory />);

        await user.click(screen.getByRole('button', { name: 'REMOVE FROM HISTORY: Bleach' }));
        expect(mock.api.removeAnimeHistory).toHaveBeenCalledWith(2);
        expect(useAnimeStore.getState().history).toEqual([OPENED]);
        expect(screen.queryByText('Bleach')).not.toBeInTheDocument();
    });

    it('clears the history and shows the empty state', async () => {
        const user = userEvent.setup();
        useAnimeStore.setState({ history: [WATCHED, OPENED] });
        render(<AnimeHistory />);

        await user.click(screen.getByRole('button', { name: 'CLEAR HISTORY' }));
        expect(mock.api.clearAnimeHistory).toHaveBeenCalledTimes(1);
        expect(useAnimeStore.getState().history).toEqual([]);
        expect(screen.getByText('// NOTHING OPENED YET. SEARCH AN ANIME OR PLAY AN EPISODE.')).toBeInTheDocument();
    });
});
