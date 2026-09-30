import type { AudioFormat, BrowserName, MaxResolution, Settings, ThemeName, VideoContainer } from './types';

export const IPC = {
    settingsGet: 'settings:get',
    settingsSave: 'settings:save',
    queueAdd: 'queue:add',
    queueList: 'queue:list',
    queueCancel: 'queue:cancel',
    queueStop: 'queue:stop',
    queueRetry: 'queue:retry',
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
    streamFind: 'stream:find',
    streamCancel: 'stream:cancel',
    streamDownload: 'stream:download',
    dialogChooseDir: 'dialog:choose-dir',
    shellShowItem: 'shell:show-item',
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

export const MIN_TITLE_LENGTH = 20;
export const MAX_TITLE_LENGTH = 200;
export const MIN_CONCURRENT = 1;
export const MAX_CONCURRENT = 5;

export const DEFAULT_SETTINGS: Settings = {
    downloadDir: '',
    useBrowserCookies: false,
    cookiesBrowser: 'firefox',
    cookiesProfile: '',
    maxResolution: 'best',
    videoContainer: 'mp4',
    audioOnly: false,
    audioFormat: 'mp3',
    maxTitleLength: 80,
    restrictFilenames: false,
    downloadPlaylist: false,
    writeSubtitles: false,
    subtitleLangs: 'en,pt',
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
    theme: 'device',
    extraArgs: ''
};
