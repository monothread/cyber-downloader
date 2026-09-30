import type { DownloadError, ErrorCode, JobStatus } from '@shared/types';

const STATUS_LABELS: Record<JobStatus, string> = {
    queued: 'QUEUED',
    running: 'DOWNLOADING',
    done: 'COMPLETE',
    error: 'FAILED',
    cancelled: 'CANCELLED'
};

export function statusLabel(status: JobStatus): string {
    return STATUS_LABELS[status];
}

export function formatPercent(percent: number): string {
    return `${percent.toFixed(1)}%`;
}

// Only failures that mean "yt-dlp did not understand this page" are worth a look at the page itself.
const STREAM_SEARCH_CODES: ReadonlyArray<ErrorCode> = ['UNKNOWN', 'OUTDATED'];

export function canFindStream(error: DownloadError | null): boolean {
    return error !== null && STREAM_SEARCH_CODES.includes(error.code);
}
