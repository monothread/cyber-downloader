import type { ErrorCode } from '@shared/types';
import { mapDownloadError, mapSpawnError } from '@main/services/errorMapper';

describe('mapDownloadError', () => {
    const cases: Array<[ErrorCode, string, string]> = [
        ['FILENAME_TOO_LONG', 'OSError: [Errno 36] File name too long', 'Title too long'],
        ['FFMPEG_MISSING', 'ERROR: Postprocessing: ffprobe and ffmpeg not found', 'ffmpeg not found'],
        ['LOGIN_REQUIRED', "ERROR: Sign in to confirm you’re not a bot", 'Login required'],
        ['LOGIN_REQUIRED', 'ERROR: This video is age-restricted', 'Login required'],
        ['UNAVAILABLE', 'ERROR: Video unavailable', 'Video unavailable'],
        ['LOGIN_REQUIRED', "ERROR: Private video. Sign in if you've been granted access", 'Login required'],
        ['UNAVAILABLE', 'ERROR: Private video', 'Video unavailable'],
        ['UNAVAILABLE', 'ERROR: This video has been removed by the uploader', 'Video unavailable'],
        ['OUTDATED', 'ERROR: Unable to extract initial data; please report this issue', 'yt-dlp may be outdated'],
        ['OUTDATED', 'ERROR: Unsupported URL: https://x.com', 'yt-dlp may be outdated'],
        ['NETWORK', 'ERROR: Unable to download webpage: <urlopen error timed out>', 'Network failure'],
        ['NETWORK', 'ERROR: getaddrinfo failed', 'Network failure'],
        ['NETWORK', 'ERROR: HTTP Error 503: Service Unavailable', 'Network failure']
    ];

    it.each(cases)('maps %s for "%s"', (code, stderr, title) => {
        const error = mapDownloadError(stderr, 1);
        expect(error.title).toBe(title);
        expect(error.raw).toBe(stderr);
        expect(error.code).toBe(code);
    });

    it('returns the full mapped error shape', () => {
        expect(mapDownloadError('ERROR: Video unavailable', 1)).toEqual({
            code: 'UNAVAILABLE',
            title: 'Video unavailable',
            hint: 'The video may be private, removed or blocked in your region.',
            raw: 'ERROR: Video unavailable'
        });
    });

    it('falls back to UNKNOWN with the raw stderr', () => {
        expect(mapDownloadError('  something odd happened \n', 2)).toEqual({
            code: 'UNKNOWN',
            title: 'Download failed',
            hint: 'See the details below.',
            raw: 'something odd happened'
        });
    });

    it('describes the exit code when stderr is empty', () => {
        expect(mapDownloadError('', 3).raw).toBe('yt-dlp exited with code 3');
        expect(mapDownloadError('', null).raw).toBe('yt-dlp exited with code unknown');
    });

    it('keeps only the last 4000 characters of very long stderr', () => {
        const stderr = `${'a'.repeat(5000)}END`;
        const error = mapDownloadError(stderr, 1);
        expect(error.raw).toHaveLength(4000);
        expect(error.raw.endsWith('END')).toBe(true);
    });
});

describe('mapSpawnError', () => {
    it('maps ENOENT to BINARY_MISSING', () => {
        const error = Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' });
        expect(mapSpawnError(error)).toEqual({
            code: 'BINARY_MISSING',
            title: 'yt-dlp not found',
            hint: 'Install yt-dlp or set its path in the settings.',
            raw: 'spawn yt-dlp ENOENT'
        });
    });

    it('maps other errors to UNKNOWN', () => {
        const error = Object.assign(new Error('spawn EACCES'), { code: 'EACCES' });
        expect(mapSpawnError(error)).toEqual({
            code: 'UNKNOWN',
            title: 'Could not start yt-dlp',
            hint: 'See the details below.',
            raw: 'spawn EACCES'
        });
    });
});
