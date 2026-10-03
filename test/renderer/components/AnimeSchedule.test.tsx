// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AnimeScheduleEntry } from '@shared/anime';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { machineTimeZone } from '@shared/timezone';
import { AnimeSchedule } from '@renderer/components/AnimeSchedule';
import { INITIAL_SCHEDULE, INITIAL_SEARCH, useAnimeStore } from '@renderer/store/animeStore';
import { useAppStore } from '@renderer/store/appStore';
import { makeScheduleEntry } from '../../helpers/animeFixtures';
import { installMockApi, type MockApiHandle } from '../../helpers/mockApi';

const initialApp = useAppStore.getState();
const initialAnime = useAnimeStore.getState();
let mock: MockApiHandle;

// Saturday, October 3, 2026, 15:30 UTC. Its day in UTC runs from 1_790_985_600 to 1_791_072_000.
const NOW = new Date('2026-10-03T15:30:00Z');
const DAY_START = 1_790_985_600;

const MORNING = makeScheduleEntry({ anilistId: 1, title: 'Sousou no Frieren', episode: 12, airingAt: DAY_START + 9 * 3600 });
const NIGHT = makeScheduleEntry({ anilistId: 2, title: 'Dandadan', names: ['Dandadan', 'Dan Da Dan'], episode: 3, airingAt: DAY_START + 22 * 3600 + 30 * 60, coverUrl: null });
const TOMORROW = makeScheduleEntry({ anilistId: 3, title: 'Blue Lock', names: ['Blue Lock'], episode: 5, airingAt: DAY_START + 86_400 + 10 * 3600 });

function timeOf(entry: AnimeScheduleEntry, timeZone = 'UTC'): string {
    return new Date(entry.airingAt * 1000).toLocaleTimeString('en', { timeZone, hour: '2-digit', minute: '2-digit' });
}

function dayOf(heading: string): HTMLElement {
    return screen.getByRole('region', { name: heading });
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    mock = installMockApi();
    mock.api.listAnimeSchedule.mockResolvedValue({ ok: true, entries: [MORNING, NIGHT] });
    useAppStore.setState({ ...initialApp, settings: DEFAULT_SETTINGS, notice: null });
    useAnimeStore.setState({ ...initialAnime, view: 'schedule', returnView: 'schedule', search: INITIAL_SEARCH, schedule: { ...INITIAL_SCHEDULE, timeZone: 'UTC' } });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('AnimeSchedule', () => {
    it('asks for the day of today in the time zone when it is shown', async () => {
        render(<AnimeSchedule />);

        await screen.findByText('Sousou no Frieren');

        expect(mock.api.listAnimeSchedule).toHaveBeenCalledTimes(1);
        expect(mock.api.listAnimeSchedule).toHaveBeenCalledWith({ from: DAY_START, to: DAY_START + 86_400, refresh: false });
    });

    it('starts with the time zone of the machine and the day view', async () => {
        useAnimeStore.setState({ schedule: INITIAL_SCHEDULE });
        render(<AnimeSchedule />);
        await screen.findByText('Sousou no Frieren');

        expect(screen.getByLabelText('Time zone')).toHaveValue(machineTimeZone());
        expect(screen.getByLabelText('View')).toHaveValue('day');
    });

    it('shows a message while the first listing is loading', async () => {
        mock.api.listAnimeSchedule.mockImplementation(() => {
            return new Promise(() => {
                return undefined;
            });
        });
        render(<AnimeSchedule />);

        expect(await screen.findByText('LOADING THE SCHEDULE…')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'REFRESH' })).toBeDisabled();
        expect(screen.queryByText('// NOTHING AIRS IN THIS PERIOD.')).not.toBeInTheDocument();
    });

    it('lists the day with its heading, marked as today, the count, the episode and the time of each episode', async () => {
        render(<AnimeSchedule />);

        await screen.findByText('Sousou no Frieren');

        expect(screen.getByRole('region', { name: 'Anime schedule' })).toBeInTheDocument();
        expect(screen.getByText('AIRING [2]')).toBeInTheDocument();
        const day = dayOf('Saturday, Oct 3');
        expect(within(day).getByRole('heading', { name: 'Saturday, Oct 3 · TODAY' })).toBeInTheDocument();
        const items = within(day).getAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(within(items[0] as HTMLElement).getByRole('button', { name: 'OPEN: Sousou no Frieren, EP 12' })).toHaveAttribute('title', 'Sousou no Frieren');
        expect(within(items[0] as HTMLElement).getByText(`EP 12 · ${timeOf(MORNING)}`)).toBeInTheDocument();
        expect(within(items[1] as HTMLElement).getByText('Dandadan')).toBeInTheDocument();
        expect(within(items[1] as HTMLElement).getByText(`EP 3 · ${timeOf(NIGHT)}`)).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /DOWNLOAD/ })).not.toBeInTheDocument();
    });

    it('shows the cover of each anime, and a placeholder where there is none', async () => {
        render(<AnimeSchedule />);
        await screen.findByText('Sousou no Frieren');

        const items = screen.getAllByRole('listitem');
        const cover = (items[0] as HTMLElement).querySelector('img');
        expect(cover).toHaveAttribute('src', 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/frieren.jpg');
        expect(cover).toHaveClass('cover');
        expect(cover).toHaveAttribute('alt', '');
        expect(cover).toHaveAttribute('loading', 'lazy');
        expect((items[1] as HTMLElement).querySelector('img')).toBeNull();
        expect(within(items[1] as HTMLElement).getByText('COVER NOT FOUND')).toHaveClass('cover', 'cover--none');
        expect(within(items[0] as HTMLElement).queryByText('COVER NOT FOUND')).not.toBeInTheDocument();
    });

    it('shows the times in the time zone that is set', async () => {
        useAnimeStore.setState({ schedule: { ...INITIAL_SCHEDULE, timeZone: 'Asia/Tokyo' } });
        render(<AnimeSchedule />);

        await screen.findByText('Dandadan');

        // Tokyo is 9 hours ahead: at 15:30 UTC it is already October 4 there, and that day starts at 15:00 UTC of October 3.
        expect(mock.api.listAnimeSchedule).toHaveBeenCalledWith({ from: DAY_START + 15 * 3600, to: DAY_START + 39 * 3600, refresh: false });
        expect(within(dayOf('Sunday, Oct 4')).getByText(`EP 3 · ${timeOf(NIGHT, 'Asia/Tokyo')}`)).toBeInTheDocument();
        // What airs before that day starts in Tokyo is not part of it.
        expect(screen.queryByText('Sousou no Frieren')).not.toBeInTheDocument();
    });

    it('lists the day again for the time zone that is picked', async () => {
        const user = userEvent.setup();
        render(<AnimeSchedule />);
        await screen.findByText('Sousou no Frieren');
        mock.api.listAnimeSchedule.mockResolvedValue({ ok: true, entries: [NIGHT] });

        await user.selectOptions(screen.getByLabelText('Time zone'), 'America/Sao_Paulo');

        await vi.waitFor(() => {
            expect(screen.queryByText('Sousou no Frieren')).not.toBeInTheDocument();
        });
        expect(mock.api.listAnimeSchedule).toHaveBeenCalledTimes(2);
        expect(mock.api.listAnimeSchedule).toHaveBeenLastCalledWith({ from: DAY_START + 3 * 3600, to: DAY_START + 3 * 3600 + 86_400, refresh: false });
        expect(useAnimeStore.getState().schedule.timeZone).toBe('America/Sao_Paulo');
        expect(screen.getByLabelText('Time zone')).toHaveValue('America/Sao_Paulo');
        expect(screen.getByText('Dandadan')).toBeInTheDocument();
    });

    it('offers the time zones with their names readable', async () => {
        render(<AnimeSchedule />);
        await screen.findByText('Sousou no Frieren');

        const select = screen.getByLabelText('Time zone');
        expect(within(select).getByRole('option', { name: 'America/Sao Paulo' })).toHaveValue('America/Sao_Paulo');
        expect(within(select).getByRole('option', { name: 'UTC' })).toHaveValue('UTC');
        expect(within(select).getByRole('option', { name: 'Asia/Tokyo' })).toHaveValue('Asia/Tokyo');
    });

    it('shows the week divided by days, each one with the episodes that air on it', async () => {
        const user = userEvent.setup();
        render(<AnimeSchedule />);
        await screen.findByText('Sousou no Frieren');
        mock.api.listAnimeSchedule.mockResolvedValue({ ok: true, entries: [MORNING, NIGHT, TOMORROW] });

        await user.selectOptions(screen.getByLabelText('View'), 'week');

        await screen.findByText('Blue Lock');
        expect(mock.api.listAnimeSchedule).toHaveBeenLastCalledWith({ from: DAY_START, to: DAY_START + 7 * 86_400, refresh: false });
        expect(screen.getByText('AIRING [3]')).toBeInTheDocument();
        const headings = ['Saturday, Oct 3', 'Sunday, Oct 4', 'Monday, Oct 5', 'Tuesday, Oct 6', 'Wednesday, Oct 7', 'Thursday, Oct 8', 'Friday, Oct 9'];
        headings.forEach((heading) => {
            expect(dayOf(heading)).toBeInTheDocument();
        });
        expect(screen.getAllByText(/ · TODAY$/)).toHaveLength(1);
        expect(within(dayOf('Saturday, Oct 3')).getAllByRole('heading')[0]).toHaveTextContent('Saturday, Oct 3 · TODAY');
        expect(
            within(dayOf('Saturday, Oct 3'))
                .getAllByRole('listitem')
                .map((item) => {
                    return within(item).getByText(/^(Sousou no Frieren|Dandadan)$/).textContent;
                })
        ).toEqual(['Sousou no Frieren', 'Dandadan']);
        expect(within(dayOf('Sunday, Oct 4')).getAllByRole('listitem')).toHaveLength(1);
        expect(within(dayOf('Sunday, Oct 4')).getByText('Blue Lock')).toBeInTheDocument();
        expect(within(dayOf('Sunday, Oct 4')).getByText(`EP 5 · ${timeOf(TOMORROW)}`)).toBeInTheDocument();
        ['Monday, Oct 5', 'Tuesday, Oct 6', 'Wednesday, Oct 7', 'Thursday, Oct 8', 'Friday, Oct 9'].forEach((heading) => {
            expect(within(dayOf(heading)).getByText('// NOTHING AIRS.')).toBeInTheDocument();
            expect(within(dayOf(heading)).queryByRole('listitem')).not.toBeInTheDocument();
        });
        expect(useAnimeStore.getState().schedule.view).toBe('week');
    });

    it('goes back to the day of today from the week', async () => {
        const user = userEvent.setup();
        render(<AnimeSchedule />);
        await screen.findByText('Sousou no Frieren');
        await user.selectOptions(screen.getByLabelText('View'), 'week');
        await vi.waitFor(() => {
            expect(mock.api.listAnimeSchedule).toHaveBeenCalledTimes(2);
        });

        await user.selectOptions(screen.getByLabelText('View'), 'day');

        await vi.waitFor(() => {
            expect(mock.api.listAnimeSchedule).toHaveBeenCalledTimes(3);
        });
        expect(mock.api.listAnimeSchedule).toHaveBeenLastCalledWith({ from: DAY_START, to: DAY_START + 86_400, refresh: false });
        await vi.waitFor(() => {
            expect(screen.getAllByRole('region').filter((region) => {
                return region.className === 'schedule__day';
            })).toHaveLength(1);
        });
    });

    it('goes to the search and looks the anime up when its card is clicked', async () => {
        const user = userEvent.setup();
        mock.api.searchAnime.mockResolvedValue({ ok: true, results: [{ index: 1, title: 'Frieren: Beyond Journey\'s End' }] });
        render(<AnimeSchedule />);
        await screen.findByText('Sousou no Frieren');

        await user.click(screen.getByRole('button', { name: 'OPEN: Sousou no Frieren, EP 12' }));

        expect(mock.api.searchAnime).toHaveBeenCalledWith('Sousou no Frieren', 'sub');
        await vi.waitFor(() => {
            expect(useAnimeStore.getState().search.status).toBe('done');
        });
        expect(useAnimeStore.getState()).toMatchObject({ view: 'search', returnView: 'search' });
        expect(useAnimeStore.getState().search.results).toEqual([{ index: 1, title: 'Frieren: Beyond Journey\'s End' }]);
    });

    it('has a card that is one button, with no other button on it', async () => {
        render(<AnimeSchedule />);
        await screen.findByText('Sousou no Frieren');

        const items = screen.getAllByRole('listitem');
        items.forEach((item) => {
            expect(item).toHaveClass('history__item', 'row--link');
            expect(within(item).getAllByRole('button')).toHaveLength(1);
        });
    });

    it('shows that nothing airs when the period is empty', async () => {
        mock.api.listAnimeSchedule.mockResolvedValue({ ok: true, entries: [] });
        render(<AnimeSchedule />);

        expect(await screen.findByText('// NOTHING AIRS IN THIS PERIOD.')).toBeInTheDocument();
        expect(screen.getByText('AIRING [0]')).toBeInTheDocument();
        expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('says what went wrong, with the details on hover, when the schedule could not be had', async () => {
        mock.api.listAnimeSchedule.mockResolvedValue({ ok: false, error: { code: 'NETWORK', raw: 'AniList answered with status 429.' } });
        render(<AnimeSchedule />);

        const alert = await screen.findByRole('alert');

        expect(alert).toHaveTextContent('Network failure. Check your connection and try again.');
        expect(alert).toHaveAttribute('title', 'AniList answered with status 429.');
        expect(screen.queryByText('// NOTHING AIRS IN THIS PERIOD.')).not.toBeInTheDocument();
        expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('lists the period again when REFRESH is pressed', async () => {
        const user = userEvent.setup();
        render(<AnimeSchedule />);
        await screen.findByText('Sousou no Frieren');
        mock.api.listAnimeSchedule.mockResolvedValue({ ok: true, entries: [NIGHT] });

        await user.click(screen.getByRole('button', { name: 'REFRESH' }));

        await vi.waitFor(() => {
            expect(screen.queryByText('Sousou no Frieren')).not.toBeInTheDocument();
        });
        expect(mock.api.listAnimeSchedule).toHaveBeenCalledTimes(2);
        expect(mock.api.listAnimeSchedule).toHaveBeenLastCalledWith({ from: DAY_START, to: DAY_START + 86_400, refresh: true });
        expect(screen.getByText('AIRING [1]')).toBeInTheDocument();
    });
});
