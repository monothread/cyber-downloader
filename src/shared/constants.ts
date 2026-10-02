import type { AudioFormat, BrowserName, LanguageCode, LanguageSetting, MaxResolution, Settings, ThemeName, VideoContainer } from './types';

export const IPC = {
    settingsGet: 'settings:get',
    settingsSave: 'settings:save',
    queueAdd: 'queue:add',
    queueList: 'queue:list',
    queueCancel: 'queue:cancel',
    queueStop: 'queue:stop',
    queueRetry: 'queue:retry',
    queueClearPartials: 'queue:clear-partials',
    queueRemove: 'queue:remove',
    queueClearFinished: 'queue:clear-finished',
    historyList: 'history:list',
    historyClear: 'history:clear',
    binariesCheck: 'binaries:check',
    ytdlpUpdate: 'ytdlp:update',
    appUpdateGet: 'app-update:get',
    appUpdateCheck: 'app-update:check',
    appUpdateDownload: 'app-update:download',
    appUpdateInstall: 'app-update:install',
    traySupport: 'tray:support',
    browsersList: 'browsers:list',
    streamFind: 'stream:find',
    streamCancel: 'stream:cancel',
    streamDownload: 'stream:download',
    dialogChooseDir: 'dialog:choose-dir',
    shellShowItem: 'shell:show-item',
    animeStatus: 'anime:status',
    animeSearch: 'anime:search',
    animeEpisodes: 'anime:episodes',
    animeDownload: 'anime:download',
    animeLibrary: 'anime:library',
    animeJobs: 'anime:jobs',
    animeCancel: 'anime:cancel',
    animeRetry: 'anime:retry',
    animeClearFinished: 'anime:clear-finished',
    animeRemoveEpisode: 'anime:remove-episode',
    animeRemoveAnime: 'anime:remove-anime',
    animeOpenFolder: 'anime:open-folder',
    animeImportLibrary: 'anime:import-library',
    animeProgress: 'anime:progress',
    animeSubtitles: 'anime:subtitles',
    animeSubtitleImport: 'anime:subtitle-import',
    animeUpdateCli: 'anime:update-cli',
    animeStreamOpen: 'anime:stream-open',
    animeStreamClose: 'anime:stream-close',
    eventAnimeJob: 'event:anime-job',
    eventAnimeLibrary: 'event:anime-library',
    eventJobUpdate: 'event:job-update',
    eventJobRemoved: 'event:job-removed',
    eventHistoryChanged: 'event:history-changed',
    eventAppUpdateState: 'event:app-update-state',
    eventStreamProgress: 'event:stream-progress'
} as const;

export const BROWSERS: readonly BrowserName[] = ['chrome', 'firefox', 'brave', 'chromium', 'edge', 'opera', 'vivaldi'];
export const RESOLUTIONS: readonly MaxResolution[] = ['best', '2160', '1440', '1080', '720', '480'];
export const VIDEO_CONTAINERS: readonly VideoContainer[] = ['mp4', 'mkv', 'webm'];
export const AUDIO_FORMATS: readonly AudioFormat[] = ['mp3', 'm4a', 'opus'];
export const THEMES: readonly ThemeName[] = ['device', 'cyberpunk', 'dark', 'light'];
export const LANGUAGE_CODES: readonly LanguageCode[] = ['en', 'pt', 'es', 'zh', 'ja'];
export const LANGUAGE_SETTINGS: readonly LanguageSetting[] = ['device', ...LANGUAGE_CODES];
export const FALLBACK_LANGUAGE: LanguageCode = 'en';

export const MIN_TITLE_LENGTH = 20;
export const MAX_TITLE_LENGTH = 200;
export const MIN_LIVE_END_CHECK_SECONDS = 1;
export const MAX_LIVE_END_CHECK_SECONDS = 120;
export const MIN_CONCURRENT = 1;
export const MAX_CONCURRENT = 5;

export const DEFAULT_SETTINGS: Settings = {
    downloadDir: '',
    useBrowserCookies: false,
    cookiesBrowser: 'firefox',
    cookiesBrowserDir: '',
    cookiesProfile: '',
    maxResolution: 'best',
    videoContainer: 'mp4',
    audioOnly: false,
    audioFormat: 'mp3',
    maxTitleLength: 80,
    restrictFilenames: false,
    deletePartialsOnFailure: true,
    downloadPlaylist: false,
    writeSubtitles: false,
    subtitleLangs: 'en,pt',
    autoSubtitles: false,
    embedSubtitles: false,
    rateLimit: '',
    maxConcurrent: 2,
    ytdlpPath: '',
    ffmpegPath: '',
    jsRuntime: '',
    checkUpdatesOnStart: true,
    closeToTray: false,
    liveFromStart: false,
    waitForLive: false,
    verifyLiveEnd: true,
    verifyLiveEndSeconds: 10,
    theme: 'device',
    language: 'device',
    extraArgs: '',
    animeDownloadDir: '',
    animeQuality: 'best',
    animeAudio: 'sub',
    animeSubtitles: 'auto'
};
