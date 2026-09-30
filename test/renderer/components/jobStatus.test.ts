import type { DownloadError, ErrorCode } from '@shared/types';
import { canFindStream, formatPercent, statusLabel } from '@renderer/components/jobStatus';

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

    it.each(['NETWORK', 'UNAVAILABLE', 'LOGIN_REQUIRED', 'FFMPEG_MISSING', 'FILENAME_TOO_LONG', 'BINARY_MISSING'] as const)('is false for %s', (code) => {
        expect(canFindStream(errorWith(code))).toBe(false);
    });

    it('is false without an error', () => {
        expect(canFindStream(null)).toBe(false);
    });
});

