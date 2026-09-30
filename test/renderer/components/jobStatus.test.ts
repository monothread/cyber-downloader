import { formatPercent, statusLabel } from '@renderer/components/jobStatus';

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
