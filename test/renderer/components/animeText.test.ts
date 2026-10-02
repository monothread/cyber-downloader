import {
    activeJobCount,
    animeErrorKey,
    animeStatusKey,
    downloadedAnime,
    downloadedCount,
    END_MARGIN_SECONDS,
    isWatched,
    matchesSearch,
    MIN_RESUME_SECONDS,
    nextDownloadedEpisode,
    previousDownloadedEpisode,
    resumePosition,
    WATCHED_RATIO
} from '@renderer/components/animeText';
import { makeAnime, makeAnimeJob, makeEpisode } from '../../helpers/animeFixtures';

describe('constants', () => {
    it('has the thresholds the player relies on', () => {
        expect(MIN_RESUME_SECONDS).toBe(5);
        expect(END_MARGIN_SECONDS).toBe(30);
        expect(WATCHED_RATIO).toBe(0.75);
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
    it('is true from 75 percent on', () => {
        expect(isWatched(1080, 1440)).toBe(true);
        expect(isWatched(1296, 1440)).toBe(true);
        expect(isWatched(1440, 1440)).toBe(true);
        expect(isWatched(1079, 1440)).toBe(false);
        expect(isWatched(0, 1440)).toBe(false);
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

describe('previousDownloadedEpisode', () => {
    const first = makeEpisode({ id: 1, number: '1', status: 'error' });
    const second = makeEpisode({ id: 2, number: '2' });
    const third = makeEpisode({ id: 3, number: '3' });
    const anime = makeAnime([first, second, third]);

    it('gives the episode that comes before when it is downloaded', () => {
        expect(previousDownloadedEpisode(anime, third)).toBe(second);
    });

    it('gives null when the previous one is not downloaded', () => {
        expect(previousDownloadedEpisode(anime, second)).toBeNull();
    });

    it('gives null before the first episode and for an episode that is not in the anime', () => {
        expect(previousDownloadedEpisode(anime, first)).toBeNull();
        expect(previousDownloadedEpisode(anime, makeEpisode({ id: 99 }))).toBeNull();
    });
});

describe('downloadedCount', () => {
    it('counts only the downloaded episodes', () => {
        const anime = makeAnime([makeEpisode({ id: 1 }), makeEpisode({ id: 2, status: 'error' }), makeEpisode({ id: 3 }), makeEpisode({ id: 4, status: 'queued' })]);
        expect(downloadedCount(anime)).toBe(2);
        expect(downloadedCount(makeAnime([]))).toBe(0);
    });
});

describe('downloadedAnime', () => {
    const SUB = makeAnime([makeEpisode({ id: 1 })], { id: 1, title: 'Naruto', audio: 'sub' });
    const DUB = makeAnime([makeEpisode({ id: 2, status: 'error' })], { id: 2, title: 'Naruto', audio: 'dub' });
    const EMPTY = makeAnime([], { id: 3, title: 'Bleach', audio: 'sub' });

    it('finds the anime with that title and audio when it has a downloaded episode', () => {
        expect(downloadedAnime([SUB, DUB, EMPTY], 'Naruto', 'sub')).toBe(SUB);
    });

    it('gives null when it has nothing downloaded, is in another audio or is not there', () => {
        expect(downloadedAnime([SUB, DUB, EMPTY], 'Naruto', 'dub')).toBeNull();
        expect(downloadedAnime([SUB, DUB, EMPTY], 'Bleach', 'sub')).toBeNull();
        expect(downloadedAnime([SUB], 'Naruto', 'dub')).toBeNull();
        expect(downloadedAnime([SUB], 'One Piece', 'sub')).toBeNull();
        expect(downloadedAnime([], 'Naruto', 'sub')).toBeNull();
    });
});

describe('matchesSearch', () => {
    it('matches everything when nothing is typed', () => {
        expect(matchesSearch('Naruto', '')).toBe(true);
        expect(matchesSearch('Naruto', '   ')).toBe(true);
        expect(matchesSearch('', '')).toBe(true);
    });

    it('finds a part of the title, wherever it is', () => {
        expect(matchesSearch('Cyberpunk: Edgerunners', 'cyber')).toBe(true);
        expect(matchesSearch('Cyberpunk: Edgerunners', 'runners')).toBe(true);
        expect(matchesSearch('Cyberpunk: Edgerunners', 'punk: edge')).toBe(true);
        expect(matchesSearch('Cyberpunk: Edgerunners', 'Cyberpunk: Edgerunners')).toBe(true);
    });

    it('does not mind the case, the accents or the spaces around', () => {
        expect(matchesSearch('NARUTO', 'naruto')).toBe(true);
        expect(matchesSearch('naruto', 'NARUTO')).toBe(true);
        expect(matchesSearch('Pokémon', 'pokemon')).toBe(true);
        expect(matchesSearch('Pokemon', 'POKÉMON')).toBe(true);
        expect(matchesSearch('Naruto', '  naruto  ')).toBe(true);
    });

    it('does not match what is not in the title', () => {
        expect(matchesSearch('Naruto', 'bleach')).toBe(false);
        expect(matchesSearch('Naruto', 'narutos')).toBe(false);
        expect(matchesSearch('', 'a')).toBe(false);
    });

    it('works with other alphabets', () => {
        expect(matchesSearch('進撃の巨人', '巨人')).toBe(true);
        expect(matchesSearch('進撃の巨人', '鬼滅')).toBe(false);
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
