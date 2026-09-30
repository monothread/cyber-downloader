import { useAppStore } from '../store/appStore';

export function HistoryList() {
    const history = useAppStore((state) => {
        return state.history;
    });
    const clearHistory = useAppStore((state) => {
        return state.clearHistory;
    });

    if (history.length === 0) {
        return <p className="empty">// HISTORY IS EMPTY.</p>;
    }

    return (
        <section className="history" aria-label="Download history">
            <div className="queue__toolbar">
                <span className="section-label">HISTORY [{history.length}]</span>
                <button
                    type="button"
                    className="btn btn--small btn--ghost"
                    onClick={() => {
                        void clearHistory();
                    }}
                >
                    CLEAR HISTORY
                </button>
            </div>
            <ul className="history__list">
                {history.map((entry) => {
                    return (
                        <li key={entry.id} className={`history__item history__item--${entry.status}`}>
                            <div className="history__main">
                                <span className="history__title" title={entry.url}>
                                    {entry.title}
                                </span>
                                <span className="history__meta">
                                    {entry.status === 'done' ? 'COMPLETE' : `FAILED — ${entry.errorTitle ?? 'Unknown error'}`} ·{' '}
                                    {new Date(entry.finishedAt).toLocaleString()}
                                </span>
                            </div>
                            {entry.filePath && (
                                <button
                                    type="button"
                                    className="btn btn--small"
                                    onClick={() => {
                                        void window.api.showItemInFolder(entry.filePath ?? '');
                                    }}
                                >
                                    SHOW FILE
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
