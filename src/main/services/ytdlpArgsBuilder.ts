import type { Settings } from '@shared/types';
import { FILE_PRINT_TEMPLATE, PROGRESS_TEMPLATE } from './progressParser';

const FILENAME_BYTE_LIMIT = '240';

export function splitArguments(input: string): string[] {
    const tokens: string[] = [];
    const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let match = pattern.exec(input);
    while (match !== null) {
        tokens.push(match[1] ?? match[2] ?? match[3] ?? '');
        match = pattern.exec(input);
    }
    return tokens;
}

function buildOutputTemplate(settings: Settings): string {
    return `%(title).${settings.maxTitleLength}s [%(id)s].%(ext)s`;
}

function buildFormatArgs(settings: Settings): string[] {
    if (settings.audioOnly) {
        return ['-f', 'ba/b', '-x', '--audio-format', settings.audioFormat];
    }
    const heightFilter = settings.maxResolution === 'best' ? '' : `[height<=${settings.maxResolution}]`;
    return ['-f', `bv*${heightFilter}+ba/b${heightFilter}`, '--merge-output-format', settings.videoContainer];
}

function buildCookieArgs(settings: Settings): string[] {
    if (!settings.useBrowserCookies) {
        return [];
    }
    const profileSuffix = settings.cookiesProfile.length > 0 ? `:${settings.cookiesProfile}` : '';
    return ['--cookies-from-browser', `${settings.cookiesBrowser}${profileSuffix}`];
}

function buildSubtitleArgs(settings: Settings): string[] {
    if (!settings.writeSubtitles) {
        return [];
    }
    const args = ['--write-subs', '--sub-langs', settings.subtitleLangs.length > 0 ? settings.subtitleLangs : 'all'];
    if (settings.embedSubtitles) {
        args.push('--embed-subs');
    }
    return args;
}

function buildOptionalArgs(settings: Settings, ffmpegLocation: string | null): string[] {
    const args: string[] = [];
    if (settings.restrictFilenames) {
        args.push('--restrict-filenames');
    }
    if (settings.rateLimit.length > 0) {
        args.push('-r', settings.rateLimit);
    }
    if (ffmpegLocation !== null) {
        args.push('--ffmpeg-location', ffmpegLocation);
    }
    if (settings.jsRuntime.length > 0) {
        args.push('--js-runtimes', settings.jsRuntime);
    }
    return args;
}

export function buildYtdlpArgs(url: string, settings: Settings, defaultDownloadDir: string, ffmpegLocation: string | null = null): string[] {
    const downloadDir = settings.downloadDir.length > 0 ? settings.downloadDir : defaultDownloadDir;
    return [
        '--newline',
        '--no-colors',
        '--progress',
        '--no-simulate',
        '--progress-template',
        PROGRESS_TEMPLATE,
        '--print',
        FILE_PRINT_TEMPLATE,
        '-P',
        downloadDir,
        '-o',
        buildOutputTemplate(settings),
        '--trim-filenames',
        FILENAME_BYTE_LIMIT,
        settings.downloadPlaylist ? '--yes-playlist' : '--no-playlist',
        ...buildFormatArgs(settings),
        ...buildCookieArgs(settings),
        ...buildSubtitleArgs(settings),
        ...buildOptionalArgs(settings, ffmpegLocation),
        ...splitArguments(settings.extraArgs),
        '--',
        url
    ];
}
