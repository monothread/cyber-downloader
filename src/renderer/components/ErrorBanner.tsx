import { useState } from 'react';
import type { DownloadError } from '@shared/types';

interface ErrorBannerProps {
    error: DownloadError;
    onRetry: () => void;
    onFindStream?: () => void;
    findStreamLabel?: string;
}

export function ErrorBanner({ error, onRetry, onFindStream, findStreamLabel = 'FIND STREAM' }: ErrorBannerProps) {
    const [showDetails, setShowDetails] = useState(false);
    return (
        <div className="error-banner" role="alert">
            <div className="error-banner__head">
                <span className="error-banner__code">{error.code}</span>
                <strong className="error-banner__title">{error.title}</strong>
            </div>
            <p className="error-banner__hint">{error.hint}</p>
            <div className="error-banner__actions">
                <button
                    type="button"
                    className="btn btn--small"
                    onClick={() => {
                        setShowDetails((previous) => {
                            return !previous;
                        });
                    }}
                >
                    {showDetails ? 'HIDE DETAILS' : 'SHOW DETAILS'}
                </button>
                <button type="button" className="btn btn--small btn--hot" onClick={onRetry}>
                    RETRY
                </button>
                {onFindStream && (
                    <button type="button" className="btn btn--small btn--primary" onClick={onFindStream}>
                        {findStreamLabel}
                    </button>
                )}
            </div>
            {showDetails && <pre className="error-banner__raw">{error.raw}</pre>}
        </div>
    );
}
