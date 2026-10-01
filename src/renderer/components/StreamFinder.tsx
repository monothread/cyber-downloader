import type { MessageKey } from '@shared/i18n';
import type { StreamKind, StreamSource } from '@shared/types';
import { useTranslator } from '../i18n/useTranslator';
import { useAppStore } from '../store/appStore';

const KIND_LABELS: Record<StreamKind, string> = { hls: 'HLS', dash: 'DASH', mp4: 'MP4', webm: 'WEBM', other: 'VIDEO' };
const SOURCE_LABEL_KEYS: Record<StreamSource, MessageKey> = { page: 'stream.sourcePage', network: 'stream.sourceNetwork' };

interface StreamFinderProps {
    jobId: string;
}

export function StreamFinder({ jobId }: StreamFinderProps) {
    const t = useTranslator();
    const search = useAppStore((state) => {
        return state.streamSearches[jobId];
    });
    const findStreams = useAppStore((state) => {
        return state.findStreams;
    });
    const cancelStreamSearch = useAppStore((state) => {
        return state.cancelStreamSearch;
    });
    const downloadStream = useAppStore((state) => {
        return state.downloadStream;
    });
    const closeStreamSearch = useAppStore((state) => {
        return state.closeStreamSearch;
    });

    if (!search) {
        return null;
    }

    return (
        <section className="stream-finder" aria-label={t('stream.aria')}>
            <header className="stream-finder__head">
                <strong>{t('stream.title')}</strong>
                <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    aria-label={t('stream.close')}
                    onClick={() => {
                        closeStreamSearch(jobId);
                    }}
                >
                    ✕
                </button>
            </header>

            {search.status === 'searching' && (
                <div className="stream-finder__status" role="status">
                    <span>{search.stage === 'scanning' ? t('stream.scanning') : t('stream.watching')}</span>
                    <button
                        type="button"
                        className="btn btn--small btn--hot"
                        onClick={() => {
                            void cancelStreamSearch(jobId);
                        }}
                    >
                        {t('stream.cancel')}
                    </button>
                </div>
            )}

            {search.status === 'done' && search.candidates.length === 0 && (
                <p className="stream-finder__empty" role="status">
                    {search.message}
                </p>
            )}

            {search.status === 'done' && search.candidates.length > 0 && (
                <>
                    <p className="stream-finder__hint">{t('stream.pick', { count: search.candidates.length })}</p>
                    <ul className="stream-finder__list">
                        {search.candidates.map((candidate, index) => {
                            return (
                                <li key={candidate.id} className="stream-candidate">
                                    <span className={`badge stream-candidate__kind stream-candidate__kind--${candidate.kind}`}>{KIND_LABELS[candidate.kind]}</span>
                                    <span className="stream-candidate__info">
                                        <span className="stream-candidate__url" title={candidate.url}>
                                            {candidate.url}
                                        </span>
                                        <span className="stream-candidate__meta">
                                            {candidate.host} · {t(SOURCE_LABEL_KEYS[candidate.source])}
                                            {candidate.duplicates > 0 && ` · ${t(candidate.duplicates === 1 ? 'stream.alternateOne' : 'stream.alternateMany', { count: candidate.duplicates })}`}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        className="btn btn--small btn--primary"
                                        aria-label={t('stream.downloadN', { n: index + 1 })}
                                        onClick={() => {
                                            void downloadStream(jobId, candidate.id);
                                        }}
                                    >
                                        {t('stream.download')}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    {!search.usedBrowser && (
                        <button
                            type="button"
                            className="btn btn--small"
                            onClick={() => {
                                void findStreams(jobId, true);
                            }}
                        >
                            {t('stream.searchDeeper')}
                        </button>
                    )}
                </>
            )}

            <p className="stream-finder__note">{t('stream.note')}</p>
        </section>
    );
}
