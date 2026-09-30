import type { DownloadError, ErrorCode } from '@shared/types';
import { canFindStream, formatBytes, formatDuration, formatPercent, statusLabel } from '@renderer/components/jobStatus';

describe('statusLabel', () => {
    it('maps every status to its label', () => {
        expect(statusLabel('queued')).toBe('QUEUED');
        expect(statusLabel('running')).toBe('DOWNLOADING');
        expect(statusLabel('done')).toBe('COMPLETE');
        expect(statusLabel('error')).toBe('FAILED');
        expect(statusLabel('cancelled')).toBe('CANCELLED');
    });
});

describe('formatPercent', () => {
    it('formats with one decimal', () => {
        expect(formatPercent(0)).toBe('0.0%');
        expect(formatPercent(42.56)).toBe('42.6%');
        expect(formatPercent(100)).toBe('100.0%');
    });
});

describe('canFindStream', () => {
    const errorWith = (code: ErrorCode): DownloadError => {
        return { code, title: 't', hint: 'h', raw: 'r' };
    };

    it.each(['UNKNOWN', 'OUTDATED'] as const)('is true when yt-dlp did not understand the page (%s)', (code) => {
        expect(canFindStream(errorWith(code))).toBe(true);
    });

    it.each(['NETWORK', 'UNAVAILABLE', 'LOGIN_REQUIRED', 'FFMPEG_MISSING', 'FILENAME_TOO_LONG', 'BINARY_MISSING', 'FORBIDDEN'] as const)('is false for %s', (code) => {
        expect(canFindStream(errorWith(code))).toBe(false);
    });

    it('offers a fresh link for a refused stream that came from a page', () => {
        expect(canFindStream(errorWith('FORBIDDEN'), 'https://site.test/ep-1')).toBe(true);
    });

    it('does not offer it when there is no page to go back to', () => {
        expect(canFindStream(errorWith('FORBIDDEN'), null)).toBe(false);
        expect(canFindStream(errorWith('FORBIDDEN'))).toBe(false);
    });

    it('still depends on the error for jobs with a page', () => {
        expect(canFindStream(errorWith('NETWORK'), 'https://site.test/ep-1')).toBe(false);
        expect(canFindStream(errorWith('UNKNOWN'), 'https://site.test/ep-1')).toBe(true);
        expect(canFindStream(null, 'https://site.test/ep-1')).toBe(false);
    });

    it('is false without an error', () => {
        expect(canFindStream(null)).toBe(false);
    });
});

describe('statusLabel for live recordings', () => {
    it('says RECORDING for a live job that is running', () => {
        expect(statusLabel('running', true)).toBe('RECORDING');
    });

    it('keeps the other statuses for live jobs', () => {
        expect(statusLabel('done', true)).toBe('COMPLETE');
        expect(statusLabel('error', true)).toBe('FAILED');
        expect(statusLabel('cancelled', true)).toBe('CANCELLED');
        expect(statusLabel('queued', true)).toBe('QUEUED');
    });

    it('says DOWNLOADING for a running job that is not live', () => {
        expect(statusLabel('running', false)).toBe('DOWNLOADING');
        expect(statusLabel('running')).toBe('DOWNLOADING');
    });
});

describe('formatDuration', () => {
    it.each([
        [0, '00:00'],
        [5, '00:05'],
        [59.9, '00:59'],
        [60, '01:00'],
        [754, '12:34'],
        [3599, '59:59'],
        [3600, '1:00:00'],
        [3700, '1:01:40'],
        [36000 + 61, '10:01:01'],
        [-5, '00:00']
    ])('formats %s seconds as %s', (seconds, expected) => {
        expect(formatDuration(seconds)).toBe(expected);
    });
});

describe('formatBytes', () => {
    it.each([
        [0, '0 B'],
        [512, '512 B'],
        [1023, '1023 B'],
        [1024, '1.0 KiB'],
        [1536, '1.5 KiB'],
        [1048576, '1.0 MiB'],
        [220200960, '210.0 MiB'],
        [1073741824, '1.0 GiB'],
        [5497558138880, '5.0 TiB'],
        [1125899906842624, '1024.0 TiB'],
        [-10, '0 B']
    ])('formats %s bytes as %s', (bytes, expected) => {
        expect(formatBytes(bytes)).toBe(expected);
    });
});

