// Types of the anime section (ani-cli). It exists on Linux only.

export type AnimeAudio = 'sub' | 'dub';

export interface AnimeSearchResult {
    // Position in the result list of that exact search: ani-cli selects an entry by it (`-S <index>`).
    index: number;
    title: string;
}

export type AniErrorCode =
    | 'NO_RESULTS'
    | 'BLOCKED'
    | 'NETWORK'
    | 'NO_SOURCES'
    | 'EPISODE_NOT_RELEASED'
    | 'INVALID_SELECTION'
    | 'BINARY_MISSING'
    | 'UNKNOWN';

export interface AniError {
    code: AniErrorCode;
    // What ani-cli (or the system) reported, without terminal control codes.
    raw: string;
}

export interface AniDownloadProgress {
    percent: number;
    totalBytes: number | null;
    speed: string | null;
    eta: string | null;
}

export type AniRunResult<T> = { status: 'done'; value: T } | { status: 'error'; error: AniError } | { status: 'cancelled' };

export const ANIME_QUALITIES = ['best', '1080p', '720p', '480p', '360p', 'worst'] as const;
export type AnimeQuality = (typeof ANIME_QUALITIES)[number];
export const ANIME_AUDIOS: readonly AnimeAudio[] = ['sub', 'dub'];
export const DEFAULT_ANIME_QUALITY_SETTING: AnimeQuality = 'best';

// Which subtitles to take: the language of the app, what ani-cli picks by itself, or one language (the name the source
// gives it).
export const ANIME_SUBTITLE_LANGUAGES = ['English', 'Portuguese', 'Spanish', 'French', 'German', 'Italian', 'Russian'] as const;
export const ANIME_SUBTITLE_SETTINGS = ['auto', 'default', ...ANIME_SUBTITLE_LANGUAGES] as const;
export type AnimeSubtitleSetting = (typeof ANIME_SUBTITLE_SETTINGS)[number];

// An episode in the library. `queued` and `downloading` only live while the app is open: after a restart what was
// unfinished is marked `error`.
export type AnimeEpisodeStatus = 'queued' | 'downloading' | 'done' | 'error' | 'cancelled';

export interface AnimeRecord {
    id: number;
    title: string;
    // What was searched and the position of the anime in that search: they are how ani-cli finds it again.
    query: string;
    searchIndex: number;
    audio: AnimeAudio;
    createdAt: number;
}

export interface AnimeEpisodeRecord {
    id: number;
    animeId: number;
    number: string;
    status: AnimeEpisodeStatus;
    filePath: string | null;
    sizeBytes: number | null;
    // What went wrong with the last attempt.
    error: AniError | null;
    positionSeconds: number;
    durationSeconds: number;
    watched: boolean;
    downloadedAt: number | null;
}

export interface LibraryAnime extends AnimeRecord {
    episodes: AnimeEpisodeRecord[];
}

export interface AnimeJob {
    // The id of the episode it downloads.
    episodeId: number;
    animeId: number;
    animeTitle: string;
    episode: string;
    status: 'queued' | 'running' | 'done' | 'error' | 'cancelled';
    percent: number;
    speed: string;
    eta: string;
    error: AniError | null;
}

// Which ani-cli is in use: where it is, which version it says it is and where it comes from.
export interface AniCliInfo {
    found: boolean;
    path: string;
    version: string | null;
    source: 'custom' | 'updated' | 'bundled';
}

export interface AnimeStatus {
    // The section exists on Linux only.
    supported: boolean;
    // The files ani-cli needs are in place.
    available: boolean;
    // The ani-cli in use; null where the section does not exist.
    aniCli: AniCliInfo | null;
}

export type AnimeSearchResponse = { ok: true; results: AnimeSearchResult[] } | { ok: false; error: AniError };
export type AnimeEpisodesResponse = { ok: true; episodes: string[] } | { ok: false; error: AniError };

export interface AnimeDownloadRequest {
    title: string;
    query: string;
    index: number;
    audio: AnimeAudio;
    episodes: string[];
}

export type AnimeDownloadResponse = { ok: true; anime: LibraryAnime } | { ok: false; message: string };

export interface AnimeProgressUpdate {
    episodeId: number;
    positionSeconds: number;
    durationSeconds: number;
    watched: boolean;
}

export const ANIME_MEDIA_SCHEME = 'pullwave-media';
export type AnimeMediaKind = 'episode' | 'subtitle';

// Where the player gets a video (or its subtitles) from: the main process serves the file of that episode.
export function animeMediaUrl(kind: AnimeMediaKind, episodeId: number): string {
    return `${ANIME_MEDIA_SCHEME}://${kind}/${episodeId}`;
}

export const ANIME_STREAM_SCHEME = 'pullwave-stream';

export interface AnimeStreamRequest {
    query: string;
    index: number;
    audio: AnimeAudio;
    episode: string;
}

// What the player needs to watch an episode without downloading it: both addresses go through the app, which adds what the
// source asks of a request (the referer).
export interface AnimeStream {
    sessionId: string;
    url: string;
    subtitleUrl: string | null;
}

export type AnimeStreamResponse = { ok: true; stream: AnimeStream } | { ok: false; error: AniError };

// The anime section needs a POSIX shell and a few tools that ship with the app for these systems.
export function isAnimeSupported(platform: string): boolean {
    return platform === 'linux' || platform === 'win32';
}
