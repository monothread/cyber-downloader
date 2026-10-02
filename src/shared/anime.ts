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
    // The seasons of one anime are separate entries in the source: the user joins them with a series name and a season number
    // (both set or both null).
    series: string | null;
    // Where the anime goes among the others of its series (1 or more); it only orders them.
    season: number | null;
    // The name the anime is shown with inside its series, instead of "SEASON N"; it is not used to order.
    seasonName: string | null;
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
    // The episode is in the library as downloaded but its file is not on the disk any more (filled in when the library is listed).
    fileMissing: boolean;
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
    // The series and season the anime is saved under; null leaves it as it is.
    series?: string | null;
    season?: number | null;
    // The name it is shown with in the series; undefined leaves it as it is.
    seasonName?: string | null;
}

export type AnimeSeriesResponse = { ok: true } | { ok: false; reason: 'invalid' | 'season-taken' };

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
export function animeMediaUrl(kind: AnimeMediaKind, episodeId: number, trackId = ''): string {
    const base = `${ANIME_MEDIA_SCHEME}://${kind}/${episodeId}`;
    return trackId.length > 0 ? `${base}/${encodeURIComponent(trackId)}` : base;
}

// A subtitle file of a downloaded episode: the one ani-cli picked, the others the source offered, or one the user loaded.
export type AnimeSubtitleKind = 'default' | 'source' | 'imported';

export interface AnimeSubtitleTrack {
    // What identifies it among the subtitles of the episode (empty for the one ani-cli picked).
    id: string;
    label: string;
    kind: AnimeSubtitleKind;
}

// What importing a folder of anime did: the episodes it added to the library, the ones whose file it pointed to a new place, the
// ones that were already there, and the videos it could not tell the episode of.
export interface AnimeImportSummary {
    added: number;
    relinked: number;
    skipped: number;
    ignored: number;
}

export type AnimeImportResponse = ({ ok: true } & AnimeImportSummary) | { ok: false; reason: 'cancelled' };

export const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;

export type AnimeSubtitleImportResponse =
    | { ok: true; tracks: AnimeSubtitleTrack[]; imported: AnimeSubtitleTrack }
    | { ok: false; reason: 'cancelled' | 'unsupported' | 'too-large' | 'unreadable' | 'missing' };

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
