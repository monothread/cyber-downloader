import {
    activeJobCount,
    animeErrorKey,
    animeStatusKey,
    downloadedCount,
    END_MARGIN_SECONDS,
    isWatched,
    MIN_RESUME_SECONDS,
    nextDownloadedEpisode,
    resumePosition,
    WATCHED_RATIO
} from '@renderer/components/animeText';
import { makeAnime, makeAnimeJob, makeEpisode } from '../../helpers/animeFixtures';

describe('constants', () => {
    it('has the thresholds the player relies on', () => {
        expect(MIN_RESUME_SECONDS).toBe(5);
        expect(END_MARGIN_SECONDS).toBe(30);
        expect(WATCHED_RATIO).toBe(0.9);
    });
});

describe('animeErrorKey', () => {
    it.each([
        ['NO_RESULTS', 'anime.error.NO_RESULTS'],
        ['BLOCKED', 'anime.error.BLOCKED'],
        ['NETWORK', 'anime.error.NETWORK'],
        ['NO_SOURCES', 'anime.error.NO_SOURCES'],
        ['EPISODE_NOT_RELEASED', 'anime.error.EPISODE_NOT_RELEASED'],
        ['INVALID_SELECTION', 'anime.error.INVALID_SELECTION'],
        ['BINARY_MISSING', 'anime.error.BINARY_MISSING'],
        ['UNKNOWN', 'anime.error.UNKNOWN']
    ] as const)('maps %s', (code, key) => {
        expect(animeErrorKey(code)).toBe(key);
    });
});

describe('animeStatusKey', () => {
    it.each([
        ['queued', 'anime.status.queued'],
        ['downloading', 'anime.status.downloading'],
        ['running', 'anime.status.downloading'],
        ['done', 'anime.status.done'],
        ['error', 'anime.status.error'],
        ['cancelled', 'anime.status.cancelled']
    ] as const)('maps %s', (status, key) => {
        expect(animeStatusKey(status)).toBe(key);
    });
});

describe('resumePosition', () => {
    it('resumes where it stopped', () => {
        expect(resumePosition(makeEpisode({ positionSeconds: 600, durationSeconds: 1440 }))).toBe(600);
    });

    it('starts from the beginning when almost nothing was watched', () => {
        expect(resumePosition(makeEpisode({ positionSeconds: 4.9, durationSeconds: 1440 }))).toBeNull();
        expect(resumePosition(makeEpisode({ positionSeconds: 5, durationSeconds: 1440 }))).toBe(5);
    });

    it('starts from the beginning when it was watched', () => {
        expect(resumePosition(makeEpisode({ positionSeconds: 600, durationSeconds: 1440, watched: true }))).toBeNull();
    });

    it('starts from the beginning when it was stopped near the end', () => {
        expect(resumePosition(makeEpisode({ positionSeconds: 1411, durationSeconds: 1440 }))).toBeNull();
        expect(resumePosition(makeEpisode({ positionSeconds: 1410, durationSeconds: 1440 }))).toBe(1410);
    });

    it('resumes when the duration is not known yet', () => {
        expect(resumePosition(makeEpisode({ positionSeconds: 600, durationSeconds: 0 }))).toBe(600);
    });
});

describe('isWatched', () => {
    it('is true from 90 percent on', () => {
        expect(isWatched(1296, 1440)).toBe(true);
        expect(isWatched(1440, 1440)).toBe(true);
        expect(isWatched(1295, 1440)).toBe(false);
    });

    it('is false when the duration is unknown', () => {
        expect(isWatched(100, 0)).toBe(false);
    });
});

describe('nextDownloadedEpisode', () => {
    const first = makeEpisode({ id: 1, number: '1' });
    const second = makeEpisode({ id: 2, number: '2' });
    const third = makeEpisode({ id: 3, number: '3', status: 'queued' });
    const anime = makeAnime([first, second, third]);

    it('gives the episode that follows when it is downloaded', () => {
        expect(nextDownloadedEpisode(anime, first)).toBe(second);
    });

    it('gives null when the next one is not downloaded', () => {
        expect(nextDownloadedEpisode(anime, second)).toBeNull();
    });

    it('gives null after the last episode and for an episode that is not in the anime', () => {
        expect(nextDownloadedEpisode(anime, third)).toBeNull();
        expect(nextDownloadedEpisode(anime, makeEpisode({ id: 99 }))).toBeNull();
    });
});

describe('downloadedCount', () => {
    it('counts only the downloaded episodes', () => {
        const anime = makeAnime([makeEpisode({ id: 1 }), makeEpisode({ id: 2, status: 'error' }), makeEpisode({ id: 3 }), makeEpisode({ id: 4, status: 'queued' })]);
        expect(downloadedCount(anime)).toBe(2);
        expect(downloadedCount(makeAnime([]))).toBe(0);
    });
});

describe('activeJobCount', () => {
    it('counts the downloads that are running or waiting', () => {
        expect(
            activeJobCount([
                makeAnimeJob({ episodeId: 1, status: 'running' }),
                makeAnimeJob({ episodeId: 2, status: 'queued' }),
                makeAnimeJob({ episodeId: 3, status: 'done' }),
                makeAnimeJob({ episodeId: 4, status: 'error' }),
                makeAnimeJob({ episodeId: 5, status: 'cancelled' })
            ])
        ).toBe(2);
        expect(activeJobCount([])).toBe(0);
    });
});
