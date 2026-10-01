import type { Translator } from '@shared/i18n';
import type { DownloadError, DownloadJob, ErrorCode, JobStatus } from '@shared/types';

export type LivePhase = 'verifying' | 'waiting' | 'merging' | 'saving';

// A running job is either closing a recording that was told to stop, joining the parts of a live recording, checking whether a live stream really ended or waiting
// for a scheduled one to start.
export function livePhase(job: Pick<DownloadJob, 'status' | 'endCheck' | 'waitingForLive' | 'merging' | 'saving'>): LivePhase | null {
    if (job.status !== 'running') {
        return null;
    }
    if (job.merging) {
        return 'merging';
    }
    if (job.saving) {
        return 'saving';
    }
    if (job.endCheck !== null) {
        return 'verifying';
    }
    return job.waitingForLive ? 'waiting' : null;
}

export function statusLabel(status: JobStatus, live: boolean, t: Translator, phase: LivePhase | null = null): string {
    if (phase !== null) {
        return t(`job.status.${phase}`);
    }
    return live && status === 'running' ? t('job.status.recording') : t(`job.status.${status}`);
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
