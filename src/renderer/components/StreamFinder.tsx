import type { StreamKind } from '@shared/types';
import { useAppStore } from '../store/appStore';

const KIND_LABELS: Record<StreamKind, string> = { hls: 'HLS', dash: 'DASH', mp4: 'MP4', webm: 'WEBM', other: 'VIDEO' };
const SOURCE_LABELS = { page: 'found in the page', network: 'seen on the network' } as const;

interface StreamFinderProps {
    jobId: string;
}

export function StreamFinder({ jobId }: StreamFinderProps) {
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
        <section className="stream-finder" aria-label="Stream finder">
            <header className="stream-finder__head">
                <strong>STREAM FINDER</strong>
                <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    aria-label="Close stream finder"
                    onClick={() => {
                        closeStreamSearch(jobId);
                    }}
                >
                    ✕
                </button>
            </header>

            {search.status === 'searching' && (
                <div className="stream-finder__status" role="status">
                    <span>{search.stage === 'scanning' ? 'Scanning the page for video links…' : 'Watching the page’s network activity (up to 25 s)…'}</span>
                    <button
                        type="button"
                        className="btn btn--small btn--hot"
                        onClick={() => {
                            void cancelStreamSearch(jobId);
                        }}
                    >
                        CANCEL
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
                    <p className="stream-finder__hint">Pick the stream to download ({search.candidates.length} found):</p>
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
                                            {candidate.host} · {SOURCE_LABELS[candidate.source]}
                                        </span>
                                    </span>
                                    <button
                                        type="button"
                                        className="btn btn--small btn--primary"
                                        aria-label={`Download stream ${index + 1}`}
                                        onClick={() => {
                                            void downloadStream(jobId, candidate.id);
                                        }}
                                    >
                                        DOWNLOAD
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
                            NOT THE ONE? SEARCH DEEPER
                        </button>
                    )}
                </>
            )}

            <p className="stream-finder__note">Protected (DRM) streams cannot be downloaded. Downloads are at your own risk: you are responsible for what you download.</p>
        </section>
    );
}
