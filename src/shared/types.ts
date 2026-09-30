export type VideoContainer = 'mp4' | 'mkv' | 'webm';
export type AudioFormat = 'mp3' | 'm4a' | 'opus';
export type BrowserName = 'chrome' | 'firefox' | 'brave' | 'chromium' | 'edge' | 'opera' | 'vivaldi';
export type MaxResolution = 'best' | '2160' | '1440' | '1080' | '720' | '480';

export interface Settings {
    downloadDir: string;
    useBrowserCookies: boolean;
    cookiesBrowser: BrowserName;
    cookiesProfile: string;
    maxResolution: MaxResolution;
    videoContainer: VideoContainer;
    audioOnly: boolean;
    audioFormat: AudioFormat;
    maxTitleLength: number;
    restrictFilenames: boolean;
    downloadPlaylist: boolean;
    writeSubtitles: boolean;
    subtitleLangs: string;
    embedSubtitles: boolean;
    rateLimit: string;
    maxConcurrent: number;
    ytdlpPath: string;
    ffmpegPath: string;
    jsRuntime: string;
    checkUpdatesOnStart: boolean;
    extraArgs: string;
}

export type ErrorCode =
    | 'NETWORK'
    | 'UNAVAILABLE'
    | 'LOGIN_REQUIRED'
    | 'FFMPEG_MISSING'
    | 'FILENAME_TOO_LONG'
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
}

export interface ProgressInfo {
    percent: number;
    speed: string;
    eta: string;
    title: string;
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

export interface CyberApi {
    getSettings: () => Promise<Settings>;
    saveSettings: (settings: Settings) => Promise<Settings>;
    addDownload: (url: string) => Promise<AddJobResult>;
    listJobs: () => Promise<DownloadJob[]>;
    cancelJob: (id: string) => Promise<void>;
    retryJob: (id: string) => Promise<void>;
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
    chooseDirectory: () => Promise<string | null>;
    showItemInFolder: (path: string) => Promise<void>;
    onJobUpdate: (listener: (job: DownloadJob) => void) => () => void;
    onJobRemoved: (listener: (id: string) => void) => () => void;
    onHistoryChanged: (listener: () => void) => () => void;
    onAppUpdateState: (listener: (state: AppUpdateState) => void) => () => void;
}
