import type { DownloadJob } from '@shared/types';
import { ErrorBanner } from './ErrorBanner';
import { formatPercent, statusLabel } from './jobStatus';

interface JobCardProps {
    job: DownloadJob;
    onCancel: (id: string) => void;
    onRetry: (id: string) => void;
    onRemove: (id: string) => void;
    onShowFile: (path: string) => void;
}

export function JobCard({ job, onCancel, onRetry, onRemove, onShowFile }: JobCardProps) {
    const isActive = job.status === 'queued' || job.status === 'running';
    const canRetry = job.status === 'error' || job.status === 'cancelled';
    return (
        <article className={`job job--${job.status}`} data-testid="job-card">
            <header className="job__head">
                <h3 className="job__title" title={job.title ?? job.url}>
                    {job.title ?? job.url}
                </h3>
                <span className={`badge badge--${job.status}`}>{statusLabel(job.status)}</span>
            </header>
            <div
                className="progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(job.percent)}
                aria-label="Download progress"
            >
                <div className="progress__bar" style={{ width: `${job.percent}%` }} />
            </div>
            <div className="job__meta">
                <span>{formatPercent(job.percent)}</span>
                {job.speed && <span>{job.speed}</span>}
                {job.eta && <span>ETA {job.eta}</span>}
            </div>
            {job.error && (
                <ErrorBanner
                    error={job.error}
                    onRetry={() => {
                        onRetry(job.id);
                    }}
                />
            )}
            <div className="job__actions">
                {isActive && (
                    <button
                        type="button"
                        className="btn btn--small btn--hot"
                        onClick={() => {
                            onCancel(job.id);
                        }}
                    >
                        CANCEL
                    </button>
                )}
                {canRetry && !job.error && (
                    <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                            onRetry(job.id);
                        }}
                    >
                        RETRY
                    </button>
                )}
                {job.status === 'done' && job.filePath && (
                    <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                            onShowFile(job.filePath ?? '');
                        }}
                    >
                        SHOW FILE
                    </button>
                )}
                {!isActive && (
                    <button
                        type="button"
                        className="btn btn--small btn--ghost"
                        onClick={() => {
                            onRemove(job.id);
                        }}
                    >
                        REMOVE
                    </button>
                )}
            </div>
        </article>
    );
}
