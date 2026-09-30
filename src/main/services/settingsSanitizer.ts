import {
    AUDIO_FORMATS,
    BROWSERS,
    DEFAULT_SETTINGS,
    MAX_CONCURRENT,
    MAX_TITLE_LENGTH,
    MIN_CONCURRENT,
    MIN_TITLE_LENGTH,
    RESOLUTIONS,
    VIDEO_CONTAINERS
} from '@shared/constants';
import type { Settings } from '@shared/types';

const RATE_LIMIT_PATTERN = /^\d+(\.\d+)?[KkMmGg]?$/;

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return allowed.find((candidate) => {
        return candidate === value;
    }) ?? fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function pickString(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value.trim() : fallback;
}

function pickClampedInteger(value: unknown, min: number, max: number, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(value)));
}

function pickRateLimit(value: unknown): string {
    const candidate = pickString(value, '');
    return RATE_LIMIT_PATTERN.test(candidate) ? candidate : '';
}

export function sanitizeSettings(input: unknown): Settings {
    const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    const defaults = DEFAULT_SETTINGS;
    return {
        downloadDir: pickString(raw.downloadDir, defaults.downloadDir),
        useBrowserCookies: pickBoolean(raw.useBrowserCookies, defaults.useBrowserCookies),
        cookiesBrowser: pickEnum(raw.cookiesBrowser, BROWSERS, defaults.cookiesBrowser),
        cookiesProfile: pickString(raw.cookiesProfile, defaults.cookiesProfile),
        maxResolution: pickEnum(raw.maxResolution, RESOLUTIONS, defaults.maxResolution),
        videoContainer: pickEnum(raw.videoContainer, VIDEO_CONTAINERS, defaults.videoContainer),
        audioOnly: pickBoolean(raw.audioOnly, defaults.audioOnly),
        audioFormat: pickEnum(raw.audioFormat, AUDIO_FORMATS, defaults.audioFormat),
        maxTitleLength: pickClampedInteger(raw.maxTitleLength, MIN_TITLE_LENGTH, MAX_TITLE_LENGTH, defaults.maxTitleLength),
        restrictFilenames: pickBoolean(raw.restrictFilenames, defaults.restrictFilenames),
        downloadPlaylist: pickBoolean(raw.downloadPlaylist, defaults.downloadPlaylist),
        writeSubtitles: pickBoolean(raw.writeSubtitles, defaults.writeSubtitles),
        subtitleLangs: pickString(raw.subtitleLangs, defaults.subtitleLangs),
        embedSubtitles: pickBoolean(raw.embedSubtitles, defaults.embedSubtitles),
        rateLimit: pickRateLimit(raw.rateLimit),
        maxConcurrent: pickClampedInteger(raw.maxConcurrent, MIN_CONCURRENT, MAX_CONCURRENT, defaults.maxConcurrent),
        ytdlpPath: pickString(raw.ytdlpPath, defaults.ytdlpPath),
        ffmpegPath: pickString(raw.ffmpegPath, defaults.ffmpegPath),
        jsRuntime: pickString(raw.jsRuntime, defaults.jsRuntime),
        checkUpdatesOnStart: pickBoolean(raw.checkUpdatesOnStart, defaults.checkUpdatesOnStart),
        extraArgs: pickString(raw.extraArgs, defaults.extraArgs)
    };
}
