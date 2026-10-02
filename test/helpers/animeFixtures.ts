import type { AniCliInfo, AnimeEpisodeRecord, AnimeJob, AnimeStatus, LibraryAnime } from '@shared/anime';

export function makeEpisode(overrides: Partial<AnimeEpisodeRecord> = {}): AnimeEpisodeRecord {
    return {
        id: 1,
        animeId: 1,
        number: '1',
        status: 'done',
        filePath: '/lib/Naruto/Naruto Episode 1.mp4',
        sizeBytes: 1024,
        error: null,
        positionSeconds: 0,
        durationSeconds: 0,
        watched: false,
        downloadedAt: 1,
        fileMissing: false,
        ...overrides
    };
}

export function makeAnime(episodes: AnimeEpisodeRecord[], overrides: Partial<LibraryAnime> = {}): LibraryAnime {
    return { id: 1, title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub', createdAt: 1, series: null, season: null, seasonName: null, episodes, ...overrides };
}

export function makeAnimeJob(overrides: Partial<AnimeJob> = {}): AnimeJob {
    return {
        episodeId: 1,
        animeId: 1,
        animeTitle: 'Naruto',
        episode: '1',
        status: 'running',
        percent: 42.5,
        speed: '1.50MiB/s',
        eta: '00:10',
        error: null,
        ...overrides
    };
}

export const ANI_CLI_INFO: AniCliInfo = { found: true, path: '/app/resources/bin/ani/ani-cli', version: '5.1.4', source: 'bundled' };

export function makeStatus(overrides: Partial<AnimeStatus> = {}): AnimeStatus {
    return { supported: true, available: true, aniCli: ANI_CLI_INFO, ...overrides };
}
