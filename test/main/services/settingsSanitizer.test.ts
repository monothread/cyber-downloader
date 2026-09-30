import { DEFAULT_SETTINGS } from '@shared/constants';
import { sanitizeSettings } from '@main/services/settingsSanitizer';

describe('sanitizeSettings', () => {
    it('returns the defaults for non-object input', () => {
        expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
        expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(sanitizeSettings('text')).toEqual(DEFAULT_SETTINGS);
    });

    it('returns the defaults for an empty object', () => {
        expect(sanitizeSettings({})).toEqual(DEFAULT_SETTINGS);
    });

    it('keeps valid values', () => {
        const valid = {
            downloadDir: '/data/videos',
            useBrowserCookies: true,
            cookiesBrowser: 'chrome',
            cookiesProfile: 'Default',
            maxResolution: '1080',
            videoContainer: 'mkv',
            audioOnly: true,
            audioFormat: 'opus',
            maxTitleLength: 120,
            restrictFilenames: true,
            downloadPlaylist: true,
            writeSubtitles: true,
            subtitleLangs: 'en',
            embedSubtitles: true,
            rateLimit: '2M',
            maxConcurrent: 3,
            ytdlpPath: '/opt/yt-dlp',
            ffmpegPath: '/opt/ffmpeg',
            jsRuntime: 'node:/usr/bin/node',
            checkUpdatesOnStart: false,
            closeToTray: true,
            liveFromStart: true,
            waitForLive: true,
            extraArgs: '--no-mtime'
        };
        expect(sanitizeSettings(valid)).toEqual(valid);
    });

    it('falls back to defaults for invalid enum values', () => {
        const result = sanitizeSettings({
            cookiesBrowser: 'netscape',
            maxResolution: '99',
            videoContainer: 'avi',
            audioFormat: 'wav'
        });
        expect(result.cookiesBrowser).toBe(DEFAULT_SETTINGS.cookiesBrowser);
        expect(result.maxResolution).toBe(DEFAULT_SETTINGS.maxResolution);
        expect(result.videoContainer).toBe(DEFAULT_SETTINGS.videoContainer);
        expect(result.audioFormat).toBe(DEFAULT_SETTINGS.audioFormat);
    });

    it('falls back to defaults for wrongly typed values', () => {
        const result = sanitizeSettings({
            useBrowserCookies: 'yes',
            checkUpdatesOnStart: 'no',
            closeToTray: 'yes',
            liveFromStart: 1,
            waitForLive: 'true',
            downloadDir: 5,
            maxTitleLength: '80',
            maxConcurrent: NaN
        });
        expect(result.useBrowserCookies).toBe(false);
        expect(result.checkUpdatesOnStart).toBe(true);
        expect(result.closeToTray).toBe(false);
        expect(result.liveFromStart).toBe(false);
        expect(result.waitForLive).toBe(false);
        expect(result.downloadDir).toBe('');
        expect(result.maxTitleLength).toBe(80);
        expect(result.maxConcurrent).toBe(2);
    });

    it('clamps and rounds numeric values', () => {
        expect(sanitizeSettings({ maxTitleLength: 5 }).maxTitleLength).toBe(20);
        expect(sanitizeSettings({ maxTitleLength: 9999 }).maxTitleLength).toBe(200);
        expect(sanitizeSettings({ maxTitleLength: 80.6 }).maxTitleLength).toBe(81);
        expect(sanitizeSettings({ maxConcurrent: 0 }).maxConcurrent).toBe(1);
        expect(sanitizeSettings({ maxConcurrent: 50 }).maxConcurrent).toBe(5);
    });

    it('trims string values', () => {
        expect(sanitizeSettings({ downloadDir: '  /tmp/x  ' }).downloadDir).toBe('/tmp/x');
    });

    it('accepts valid rate limits and rejects invalid ones', () => {
        expect(sanitizeSettings({ rateLimit: '500K' }).rateLimit).toBe('500K');
        expect(sanitizeSettings({ rateLimit: '1.5m' }).rateLimit).toBe('1.5m');
        expect(sanitizeSettings({ rateLimit: '100' }).rateLimit).toBe('100');
        expect(sanitizeSettings({ rateLimit: 'fast' }).rateLimit).toBe('');
        expect(sanitizeSettings({ rateLimit: '1M; rm -rf' }).rateLimit).toBe('');
        expect(sanitizeSettings({ rateLimit: 10 }).rateLimit).toBe('');
    });
});
