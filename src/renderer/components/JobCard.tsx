import type { DownloadJob } from '@shared/types';
import { useAppStore } from '../store/appStore';
import { ErrorBanner } from './ErrorBanner';
import { canFindStream, formatPercent, statusLabel } from './jobStatus';
import { StreamFinder } from './StreamFinder';

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
    const searchOpen = useAppStore((state) => {
        return state.streamSearches[job.id] !== undefined;
    });
    const findStreams = useAppStore((state) => {
        return state.findStreams;
    });
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
                    onFindStream={
                        canFindStream(job.error) && !searchOpen
                            ? () => {
                                  void findStreams(job.id, false);
                              }
                            : undefined
                    }
                />
            )}
            <StreamFinder jobId={job.id} />
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
