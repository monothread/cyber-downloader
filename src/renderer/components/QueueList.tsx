import { useAppStore } from '../store/appStore';
import { JobCard } from './JobCard';

export function QueueList() {
    const jobs = useAppStore((state) => {
        return state.jobs;
    });
    const cancelJob = useAppStore((state) => {
        return state.cancelJob;
    });
    const stopJob = useAppStore((state) => {
        return state.stopJob;
    });
    const retryJob = useAppStore((state) => {
        return state.retryJob;
    });
    const removeJob = useAppStore((state) => {
        return state.removeJob;
    });
    const clearFinished = useAppStore((state) => {
        return state.clearFinished;
    });
    const hasFinished = jobs.some((job) => {
        return job.status === 'done' || job.status === 'error' || job.status === 'cancelled';
    });

    if (jobs.length === 0) {
        return <p className="empty">// NO ACTIVE DOWNLOADS. JACK IN A URL ABOVE.</p>;
    }

    return (
        <section className="queue" aria-label="Download queue">
            <div className="queue__toolbar">
                <span className="section-label">QUEUE [{jobs.length}]</span>
                {hasFinished && (
                    <button
                        type="button"
                        className="btn btn--small btn--ghost"
                        onClick={() => {
                            void clearFinished();
                        }}
                    >
                        CLEAR FINISHED
                    </button>
                )}
            </div>
            {jobs.map((job) => {
                return (
                    <JobCard
                        key={job.id}
                        job={job}
                        onCancel={(id) => {
                            void cancelJob(id);
                        }}
                        onStop={(id) => {
                            void stopJob(id);
                        }}
                        onRetry={(id) => {
                            void retryJob(id);
                        }}
                        onRemove={(id) => {
                            void removeJob(id);
                        }}
                        onShowFile={(path) => {
                            void window.api.showItemInFolder(path);
                        }}
                    />
                );
            })}
        </section>
    );
}
