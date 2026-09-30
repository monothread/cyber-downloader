import type { Settings } from '@shared/types';
import { FILE_PRINT_TEMPLATE, PROGRESS_TEMPLATE } from './progressParser';

const FILENAME_BYTE_LIMIT = '240';

// What a download found by the stream finder needs to reach the stream as the page itself would have.
export interface RequestExtras {
    referer?: string;
    userAgent?: string;
    cookie?: string;
    title?: string;
}

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

const INVALID_FILENAME_CHARACTERS = new Set(['\\', '/', ':', '*', '?', '"', '<', '>', '|']);

function replaceInvalidCharacters(title: string): string {
    return Array.from(title, (character) => {
        return character.charCodeAt(0) < 32 || INVALID_FILENAME_CHARACTERS.has(character) ? ' ' : character;
    }).join('');
}

// A title taken from a web page goes into an output template: "%" must be escaped and path separators removed.
export function escapeTitleForTemplate(title: string, maxLength: number): string {
    return replaceInvalidCharacters(title)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
        .trim()
        .replace(/%/g, '%%');
}

function buildOutputTemplate(settings: Settings, extras: RequestExtras): string {
    const title = extras.title ? escapeTitleForTemplate(extras.title, settings.maxTitleLength) : '';
    return title.length > 0 ? `${title} [%(id)s].%(ext)s` : `%(title).${settings.maxTitleLength}s [%(id)s].%(ext)s`;
}

function buildRequestArgs(extras: RequestExtras): string[] {
    const args: string[] = [];
    if (extras.referer) {
        args.push('--referer', extras.referer);
    }
    if (extras.userAgent) {
        args.push('--user-agent', extras.userAgent);
    }
    if (extras.cookie) {
        args.push('--add-header', `Cookie:${extras.cookie}`);
    }
    return args;
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

export function buildYtdlpArgs(
    url: string,
    settings: Settings,
    defaultDownloadDir: string,
    ffmpegLocation: string | null = null,
    extras: RequestExtras = {}
): string[] {
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
        buildOutputTemplate(settings, extras),
        '--trim-filenames',
        FILENAME_BYTE_LIMIT,
        settings.downloadPlaylist ? '--yes-playlist' : '--no-playlist',
        ...buildFormatArgs(settings),
        ...buildCookieArgs(settings),
        ...buildSubtitleArgs(settings),
        ...buildOptionalArgs(settings, ffmpegLocation),
        ...buildRequestArgs(extras),
        ...splitArguments(settings.extraArgs),
        '--',
        url
    ];
}
