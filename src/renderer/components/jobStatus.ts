import type { JobStatus } from '@shared/types';

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
