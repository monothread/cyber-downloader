import type { AniErrorCode, AnimeAudio, AnimeEpisodeRecord, AnimeEpisodeStatus, AnimeJob, LibraryAnime } from '@shared/anime';
import type { MessageKey } from '@shared/i18n';

// An episode is only offered to resume when a bit was watched and it is not about to end.
export const MIN_RESUME_SECONDS = 5;
export const END_MARGIN_SECONDS = 30;
// Past this share of the episode it counts as watched.
export const WATCHED_RATIO = 0.75;

const ERROR_KEYS: Record<AniErrorCode, MessageKey> = {
    NO_RESULTS: 'anime.error.NO_RESULTS',
    BLOCKED: 'anime.error.BLOCKED',
    NETWORK: 'anime.error.NETWORK',
    NO_SOURCES: 'anime.error.NO_SOURCES',
    EPISODE_NOT_RELEASED: 'anime.error.EPISODE_NOT_RELEASED',
    INVALID_SELECTION: 'anime.error.INVALID_SELECTION',
    BINARY_MISSING: 'anime.error.BINARY_MISSING',
    UNKNOWN: 'anime.error.UNKNOWN'
};

const STATUS_KEYS: Record<AnimeEpisodeStatus | AnimeJob['status'], MessageKey> = {
    queued: 'anime.status.queued',
    downloading: 'anime.status.downloading',
    running: 'anime.status.downloading',
    done: 'anime.status.done',
    error: 'anime.status.error',
    cancelled: 'anime.status.cancelled'
};

export function animeErrorKey(code: AniErrorCode): MessageKey {
    return ERROR_KEYS[code];
}

export function animeStatusKey(status: AnimeEpisodeStatus | AnimeJob['status']): MessageKey {
    return STATUS_KEYS[status];
}

// Where to resume an episode, or null to start it from the beginning.
export function resumePosition(episode: AnimeEpisodeRecord): number | null {
    const { positionSeconds, durationSeconds, watched } = episode;
    if (watched || positionSeconds < MIN_RESUME_SECONDS) {
        return null;
    }
    if (durationSeconds > 0 && positionSeconds > durationSeconds - END_MARGIN_SECONDS) {
        return null;
    }
    return positionSeconds;
}

// The episode next to this one in the library (after it for 1, before it for -1), if it is already downloaded.
function adjacentDownloadedEpisode(anime: LibraryAnime, current: AnimeEpisodeRecord, direction: 1 | -1): AnimeEpisodeRecord | null {
    const position = anime.episodes.findIndex((episode) => {
        return episode.id === current.id;
    });
    const adjacent = position === -1 ? undefined : anime.episodes[position + direction];
    return adjacent?.status === 'done' ? adjacent : null;
}

// The episode that follows in the library, if it is already downloaded.
export function nextDownloadedEpisode(anime: LibraryAnime, current: AnimeEpisodeRecord): AnimeEpisodeRecord | null {
    return adjacentDownloadedEpisode(anime, current, 1);
}

// The episode that comes before in the library, if it is already downloaded.
export function previousDownloadedEpisode(anime: LibraryAnime, current: AnimeEpisodeRecord): AnimeEpisodeRecord | null {
    return adjacentDownloadedEpisode(anime, current, -1);
}

export function isWatched(positionSeconds: number, durationSeconds: number): boolean {
    return durationSeconds > 0 && positionSeconds / durationSeconds >= WATCHED_RATIO;
}

export function downloadedCount(anime: LibraryAnime): number {
    return anime.episodes.filter((episode) => {
        return episode.status === 'done';
    }).length;
}

// The anime of the library that has this title and audio, when at least one of its episodes is downloaded.
export function downloadedAnime(library: readonly LibraryAnime[], title: string, audio: AnimeAudio): LibraryAnime | null {
    const found = library.find((candidate) => {
        return candidate.title === title && candidate.audio === audio;
    });
    return found && downloadedCount(found) > 0 ? found : null;
}

function foldText(text: string): string {
    return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// Whether a title matches what was typed in the search of the library: no matter the case or the accents, and an empty search
// matches everything.
export function matchesSearch(title: string, search: string): boolean {
    const wanted = foldText(search.trim());
    return wanted.length === 0 || foldText(title).includes(wanted);
}

// The downloads that are happening or waiting: what the button of the downloads screen counts.
export function activeJobCount(jobs: readonly AnimeJob[]): number {
    return jobs.filter((job) => {
        return job.status === 'queued' || job.status === 'running';
    }).length;
}
