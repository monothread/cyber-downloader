import { useTranslator } from '../i18n/useTranslator';
import { useAppStore } from '../store/appStore';
import { JobCard } from './JobCard';
import { sortForDisplay } from './jobStatus';

export function QueueList() {
    const t = useTranslator();
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
    const clearPartialFiles = useAppStore((state) => {
        return state.clearPartialFiles;
    });
    const clearFinished = useAppStore((state) => {
        return state.clearFinished;
    });
    const hasFinished = jobs.some((job) => {
        return job.status === 'done' || job.status === 'error' || job.status === 'cancelled';
    });

    if (jobs.length === 0) {
        return <p className="empty">{t('queue.empty')}</p>;
    }

    return (
        <section className="queue" aria-label={t('queue.aria')}>
            <div className="queue__toolbar">
                <span className="section-label">{t('queue.label', { count: jobs.length })}</span>
                {hasFinished && (
                    <button
                        type="button"
                        className="btn btn--small btn--ghost"
                        onClick={() => {
                            void clearFinished();
                        }}
                    >
                        {t('queue.clearFinished')}
                    </button>
                )}
            </div>
            {sortForDisplay(jobs).map((job) => {
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
                        onClearPartials={(id) => {
                            void clearPartialFiles(id);
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
