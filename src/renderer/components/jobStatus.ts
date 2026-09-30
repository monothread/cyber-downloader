import type { DownloadError, ErrorCode, JobStatus } from '@shared/types';

const STATUS_LABELS: Record<JobStatus, string> = {
    queued: 'QUEUED',
    running: 'DOWNLOADING',
    done: 'COMPLETE',
    error: 'FAILED',
    cancelled: 'CANCELLED'
};

export function statusLabel(status: JobStatus, live = false): string {
    return live && status === 'running' ? 'RECORDING' : STATUS_LABELS[status];
}

export function formatPercent(percent: number): string {
    return `${percent.toFixed(1)}%`;
}

// Only failures that mean "yt-dlp did not understand this page" are worth a look at the page itself.
const STREAM_SEARCH_CODES: ReadonlyArray<ErrorCode> = ['UNKNOWN', 'OUTDATED'];

// A stream that was refused (expired or tied to another session) can be replaced by a fresh one from its page.
export function canFindStream(error: DownloadError | null, pageUrl: string | null = null): boolean {
    if (error === null) {
        return false;
    }
    return STREAM_SEARCH_CODES.includes(error.code) || (error.code === 'FORBIDDEN' && pageUrl !== null);
}

export function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = String(seconds % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${String(minutes).padStart(2, '0')}:${rest}`;
}

const SIZE_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

export function formatBytes(bytes: number): string {
    let value = Math.max(0, bytes);
    let unit = 0;
    while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return unit === 0 ? `${Math.round(value)} B` : `${value.toFixed(1)} ${SIZE_UNITS[unit]}`;
}
