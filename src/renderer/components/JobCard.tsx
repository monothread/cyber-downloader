import type { DownloadJob } from '@shared/types';
import { useAppStore } from '../store/appStore';
import { ErrorBanner } from './ErrorBanner';
import { canFindStream, formatBytes, formatDuration, formatPercent, statusLabel } from './jobStatus';
import { StreamFinder } from './StreamFinder';

interface JobCardProps {
    job: DownloadJob;
    onCancel: (id: string) => void;
    onStop: (id: string) => void;
    onRetry: (id: string) => void;
    onRemove: (id: string) => void;
    onClearPartials: (id: string) => void;
    onShowFile: (path: string) => void;
}

export const LIVE_PARTIAL_CONFIRM_MESSAGE = 'This live recording was not saved. Deleting it cannot be undone. Delete it?';

export function JobCard({ job, onCancel, onStop, onRetry, onRemove, onClearPartials, onShowFile }: JobCardProps) {
    const isActive = job.status === 'queued' || job.status === 'running';
    const isRecording = job.live && job.status === 'running';
    const canRetry = job.status === 'error' || job.status === 'cancelled';
    // A live recording left behind may still be playable, so deleting it is confirmed first.
    const confirmDeletion = (): boolean => {
        return !(job.live && job.hasPartial) || window.confirm(LIVE_PARTIAL_CONFIRM_MESSAGE);
    };
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
                <span className={`badge badge--${job.status}`}>{statusLabel(job.status, job.live)}</span>
            </header>
            {isRecording ? (
                <div className="progress progress--live" role="progressbar" aria-label="Recording a live stream">
                    <div className="progress__bar" />
                </div>
            ) : (
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
            )}
            <div className="job__meta">
                {isRecording ? (
                    <>
                        <span className="job__live">● LIVE</span>
                        <span>{formatDuration(job.elapsedSeconds)}</span>
                        <span>{formatBytes(job.downloadedBytes)}</span>
                    </>
                ) : (
                    <span>{formatPercent(job.percent)}</span>
                )}
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
                        canFindStream(job.error, job.pageUrl) && !searchOpen
                            ? () => {
                                  void findStreams(job.id, false);
                              }
                            : undefined
                    }
                    findStreamLabel={job.pageUrl !== null ? 'FIND A FRESH LINK' : 'FIND STREAM'}
                />
            )}
            <StreamFinder jobId={job.id} />
            <div className="job__actions">
                {isRecording && (
                    <button
                        type="button"
                        className="btn btn--small btn--primary"
                        onClick={() => {
                            onStop(job.id);
                        }}
                    >
                        STOP & SAVE
                    </button>
                )}
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
                {canRetry && job.hasPartial && (
                    <button
                        type="button"
                        className="btn btn--small"
                        onClick={() => {
                            if (confirmDeletion()) {
                                onClearPartials(job.id);
                            }
                        }}
                    >
                        CLEAR PARTIAL FILES
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
                            if (confirmDeletion()) {
                                onRemove(job.id);
                            }
                        }}
                    >
                        REMOVE
                    </button>
                )}
            </div>
        </article>
    );
}
