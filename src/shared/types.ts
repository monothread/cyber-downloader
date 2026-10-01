import type {
    AnimeDownloadRequest,
    AnimeDownloadResponse,
    AnimeEpisodesResponse,
    AnimeJob,
    AnimeProgressUpdate,
    AnimeSearchResponse,
    AnimeStatus,
    AnimeStreamRequest,
    AnimeStreamResponse,
    AnimeAudio,
    AnimeQuality,
    AnimeSubtitleSetting,
    LibraryAnime
} from './anime';

export type VideoContainer = 'mp4' | 'mkv' | 'webm';
export type AudioFormat = 'mp3' | 'm4a' | 'opus';
// Settings that can be chosen for one download only. A missing field follows the setting.
export interface DownloadOptions {
    maxResolution?: MaxResolution;
    videoContainer?: VideoContainer;
    audioOnly?: boolean;
    audioFormat?: AudioFormat;
    liveFromStart?: boolean;
    waitForLive?: boolean;
    verifyLiveEnd?: boolean;
    verifyLiveEndSeconds?: number;
}

// A link to download, optionally into a folder other than the one in the settings and with options of its own.
export interface LinkRequest {
    url: string;
    downloadDir: string | null;
    options: DownloadOptions;
}

export type ThemeName = 'device' | 'cyberpunk' | 'dark' | 'light';
export type LanguageCode = 'en' | 'pt' | 'es' | 'zh' | 'ja';
export type LanguageSetting = 'device' | LanguageCode;
export type BrowserName = 'chrome' | 'firefox' | 'brave' | 'chromium' | 'edge' | 'opera' | 'vivaldi';
// A browser profile that has cookies: `id` is its folder inside the browser's data folder.
export interface BrowserProfile {
    id: string;
    name: string;
}

// A browser found on this system: `engine` tells yt-dlp how to decrypt its cookies, `dataDir` is where its profiles live.
export interface DetectedBrowser {
    label: string;
    engine: BrowserName;
    dataDir: string;
    profiles: BrowserProfile[];
}
export type MaxResolution = 'best' | '2160' | '1440' | '1080' | '720' | '480';

export interface Settings {
    downloadDir: string;
    useBrowserCookies: boolean;
    cookiesBrowser: BrowserName;
    cookiesBrowserDir: string;
    cookiesProfile: string;
    maxResolution: MaxResolution;
    videoContainer: VideoContainer;
    audioOnly: boolean;
    audioFormat: AudioFormat;
    maxTitleLength: number;
    restrictFilenames: boolean;
    deletePartialsOnFailure: boolean;
    downloadPlaylist: boolean;
    writeSubtitles: boolean;
    subtitleLangs: string;
    autoSubtitles: boolean;
    embedSubtitles: boolean;
    rateLimit: string;
    maxConcurrent: number;
    ytdlpPath: string;
    ffmpegPath: string;
    jsRuntime: string;
    checkUpdatesOnStart: boolean;
    closeToTray: boolean;
    liveFromStart: boolean;
    waitForLive: boolean;
    verifyLiveEnd: boolean;
    verifyLiveEndSeconds: number;
    theme: ThemeName;
    language: LanguageSetting;
    extraArgs: string;
    // Anime section (Linux only).
    animeDownloadDir: string;
    animeQuality: AnimeQuality;
    animeAudio: AnimeAudio;
    animeSubtitles: AnimeSubtitleSetting;
}

export type ErrorCode =
    | 'NETWORK'
    | 'UNAVAILABLE'
    | 'LOGIN_REQUIRED'
    | 'FFMPEG_MISSING'
    | 'FILENAME_TOO_LONG'
    | 'FORBIDDEN'
    | 'OUTDATED'
    | 'BINARY_MISSING'
    | 'UNKNOWN';

export interface DownloadError {
    code: ErrorCode;
    title: string;
    hint: string;
    raw: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

// A live stream that seems to have ended is checked for a few seconds before the download is considered finished.
export interface LiveEndCheck {
    secondsLeft: number;
    totalSeconds: number;
}

export interface DownloadJob {
    id: string;
    url: string;
    status: JobStatus;
    title: string | null;
    percent: number;
    speed: string;
    eta: string;
    filePath: string | null;
    error: DownloadError | null;
    createdAt: number;
    pageUrl: string | null;
    live: boolean;
    elapsedSeconds: number;
    downloadedBytes: number;
    // Unfinished files of this download are still in the folder (after an error or a cancel).
    hasPartial: boolean;
    // The download has options of its own that replace some settings.
    customized: boolean;
    // yt-dlp is waiting for a scheduled live stream to start.
    waitingForLive: boolean;
    // Set while the app checks whether a live stream really ended.
    endCheck: LiveEndCheck | null;
    // The parts of a live recording that was resumed are being joined into one file.
    merging: boolean;
    // STOP & SAVE was asked and the recording is being closed into its file.
    saving: boolean;
    // Name of the yt-dlp post-processor (ffmpeg step after the download, such as ExtractAudio or Merger) that is running.
    postProcess: string | null;
}

export interface ProgressInfo {
    percent: number;
    speed: string;
    eta: string;
    title: string;
    downloadedBytes: number | null;
    elapsedSeconds: number | null;
    live: boolean;
}

// yt-dlp reports when each post-processor (the steps that run after the bytes are downloaded) starts and finishes.
export interface PostProcessEvent {
    status: 'started' | 'finished';
    processor: string;
}

export interface DownloadInfo {
    live: boolean;
    filePath: string;
}

export interface HistoryEntry {
    id: string;
    url: string;
    title: string;
    filePath: string | null;
    status: 'done' | 'error';
    errorTitle: string | null;
    finishedAt: number;
}

export type BinarySource = 'custom' | 'updated' | 'bundled' | 'system';

export interface BinaryInfo {
    found: boolean;
    path: string;
    version: string | null;
    source: BinarySource;
}

export interface BinariesStatus {
    ytdlp: BinaryInfo;
    ffmpeg: BinaryInfo;
}

export interface UpdateResult {
    ok: boolean;
    output: string;
}

export interface AddJobResult {
    ok: boolean;
    job: DownloadJob | null;
    message: string | null;
}

export type AppUpdateStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
    | 'unsupported';

export interface AppUpdateState {
    status: AppUpdateStatus;
    currentVersion: string;
    version: string | null;
    percent: number;
    message: string | null;
}

export interface TraySupport {
    available: boolean;
    reason: string | null;
}

export type StreamKind = 'hls' | 'dash' | 'mp4' | 'webm' | 'other';
export type StreamSource = 'page' | 'network';
export type StreamFindStage = 'scanning' | 'watching';

export interface StreamCandidate {
    id: string;
    url: string;
    kind: StreamKind;
    source: StreamSource;
    host: string;
    title: string | null;
    duplicates: number;
}

export interface StreamFindResult {
    ok: boolean;
    candidates: StreamCandidate[];
    message: string | null;
    usedBrowser: boolean;
}

export interface StreamFindProgress {
    jobId: string;
    stage: StreamFindStage;
}

export interface CyberApi {
    getSettings: () => Promise<Settings>;
    saveSettings: (settings: Settings) => Promise<Settings>;
    addDownload: (url: string, downloadDir?: string, options?: DownloadOptions) => Promise<AddJobResult>;
    listJobs: () => Promise<DownloadJob[]>;
    cancelJob: (id: string) => Promise<void>;
    stopJob: (id: string) => Promise<void>;
    retryJob: (id: string) => Promise<void>;
    clearPartialFiles: (id: string) => Promise<void>;
    removeJob: (id: string) => Promise<void>;
    clearFinished: () => Promise<void>;
    listHistory: () => Promise<HistoryEntry[]>;
    clearHistory: () => Promise<void>;
    checkBinaries: () => Promise<BinariesStatus>;
    updateYtdlp: () => Promise<UpdateResult>;
    getAppUpdateState: () => Promise<AppUpdateState>;
    checkAppUpdate: () => Promise<void>;
    downloadAppUpdate: () => Promise<void>;
    installAppUpdate: () => Promise<void>;
    getTraySupport: () => Promise<TraySupport>;
    listBrowsers: (refresh?: boolean) => Promise<DetectedBrowser[]>;
    findStreams: (jobId: string, deep: boolean) => Promise<StreamFindResult>;
    cancelStreamFind: (jobId: string) => Promise<void>;
    downloadStream: (candidateId: string) => Promise<AddJobResult>;
    chooseDirectory: () => Promise<string | null>;
    showItemInFolder: (path: string) => Promise<void>;
    getAnimeStatus: () => Promise<AnimeStatus>;
    searchAnime: (query: string, audio: AnimeAudio) => Promise<AnimeSearchResponse>;
    listAnimeEpisodes: (query: string, index: number, audio: AnimeAudio) => Promise<AnimeEpisodesResponse>;
    downloadAnime: (request: AnimeDownloadRequest) => Promise<AnimeDownloadResponse>;
    listAnimeLibrary: () => Promise<LibraryAnime[]>;
    listAnimeJobs: () => Promise<AnimeJob[]>;
    cancelAnimeJob: (episodeId: number) => Promise<void>;
    retryAnimeJob: (episodeId: number) => Promise<void>;
    clearFinishedAnimeJobs: () => Promise<void>;
    removeAnimeEpisode: (episodeId: number) => Promise<void>;
    removeAnime: (animeId: number) => Promise<void>;
    saveAnimeProgress: (update: AnimeProgressUpdate) => Promise<void>;
    updateAniCli: () => Promise<UpdateResult>;
    openAnimeStream: (request: AnimeStreamRequest) => Promise<AnimeStreamResponse>;
    closeAnimeStream: (sessionId: string) => Promise<void>;
    onAnimeJobUpdate: (listener: (job: AnimeJob) => void) => () => void;
    onAnimeLibraryChanged: (listener: () => void) => () => void;
    onJobUpdate: (listener: (job: DownloadJob) => void) => () => void;
    onJobRemoved: (listener: (id: string) => void) => () => void;
    onHistoryChanged: (listener: () => void) => () => void;
    onAppUpdateState: (listener: (state: AppUpdateState) => void) => () => void;
    onStreamFindProgress: (listener: (progress: StreamFindProgress) => void) => () => void;
}
