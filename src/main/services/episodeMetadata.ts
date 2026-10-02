import { ANIME_AUDIOS, type AnimeAudio, type AnimeEpisodeRecord, type AnimeRecord } from '@shared/anime';
import { isValidEpisode } from './aniArgsBuilder';
import { episodeFolderOf, METADATA_FILE_NAME, metadataPathFor } from './animeFiles';
import type { AnimeDb } from './animeDb';

// Next to the video of each episode the app keeps what it needs to recognize it again, whatever the folders are called: if the
// library is lost (a new computer, a reinstall) the folder can be scanned and every episode comes back as it was.
export { METADATA_FILE_NAME, metadataPathFor };
export const METADATA_VERSION = 1;

export interface EpisodeMetadata {
    version: typeof METADATA_VERSION;
    title: string;
    query: string;
    // The position of the anime in its search; 0 when it is not known.
    searchIndex: number;
    audio: AnimeAudio;
    number: string;
    positionSeconds: number;
    durationSeconds: number;
    watched: boolean;
}

export interface MetadataFiles {
    read: (path: string) => string | null;
    write: (path: string, content: string) => void;
}

export function metadataOf(anime: AnimeRecord, episode: AnimeEpisodeRecord): EpisodeMetadata {
    return {
        version: METADATA_VERSION,
        title: anime.title,
        query: anime.query,
        searchIndex: anime.searchIndex,
        audio: anime.audio,
        number: episode.number,
        positionSeconds: episode.positionSeconds,
        durationSeconds: episode.durationSeconds,
        watched: episode.watched
    };
}

function isNonNegative(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// The metadata in a text, or null when it is not valid: a file that was edited or damaged is ignored as a whole.
export function parseEpisodeMetadata(content: string): EpisodeMetadata | null {
    let raw: unknown;
    try {
        raw = JSON.parse(content);
    } catch {
        return null;
    }
    if (typeof raw !== 'object' || raw === null) {
        return null;
    }
    const { version, title, query, searchIndex, audio, number, positionSeconds, durationSeconds, watched } = raw as Record<string, unknown>;
    const knownAudio = ANIME_AUDIOS.find((candidate) => {
        return candidate === audio;
    });
    if (
        version !== METADATA_VERSION ||
        typeof title !== 'string' ||
        title.trim().length === 0 ||
        typeof query !== 'string' ||
        typeof searchIndex !== 'number' ||
        !Number.isInteger(searchIndex) ||
        searchIndex < 0 ||
        knownAudio === undefined ||
        typeof number !== 'string' ||
        !isValidEpisode(number) ||
        !isNonNegative(positionSeconds) ||
        !isNonNegative(durationSeconds) ||
        typeof watched !== 'boolean'
    ) {
        return null;
    }
    return { version, title, query, searchIndex, audio: knownAudio, number, positionSeconds, durationSeconds, watched };
}

export function readEpisodeMetadata(videoPath: string, files: Pick<MetadataFiles, 'read'>): EpisodeMetadata | null {
    const content = files.read(metadataPathFor(videoPath));
    return content === null ? null : parseEpisodeMetadata(content);
}

// Failing to write it never fails what the user was doing: the library works without it.
export function writeEpisodeMetadata(videoPath: string, metadata: EpisodeMetadata, files: Pick<MetadataFiles, 'write'>): void {
    try {
        files.write(metadataPathFor(videoPath), `${JSON.stringify(metadata, null, 2)}\n`);
    } catch {
        return;
    }
}

// Saves what the library knows of a downloaded episode next to its video. Only an episode in a folder of its own gets one: the
// videos that were downloaded before that share the folder of the anime, which has room for a single file.
export function refreshEpisodeMetadata(
    db: Pick<AnimeDb, 'getEpisode' | 'getAnime'>,
    episodeId: number,
    files: Pick<MetadataFiles, 'write'>,
    platform: NodeJS.Platform = process.platform
): void {
    const episode = db.getEpisode(episodeId);
    const anime = episode ? db.getAnime(episode.animeId) : null;
    if (!episode || !anime || episode.status !== 'done' || episode.filePath === null) {
        return;
    }
    if (episodeFolderOf(episode.filePath, episode.number, platform) === null) {
        return;
    }
    writeEpisodeMetadata(episode.filePath, metadataOf(anime, episode), files);
}
