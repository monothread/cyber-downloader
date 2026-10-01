import { useEffect } from 'react';
import { useTranslator } from '../i18n/useTranslator';
import { useAppStore } from '../store/appStore';

// An information notice goes away by itself; an error stays until it is dismissed.
export const INFO_NOTICE_MS = 3000;

export function Toast() {
    const t = useTranslator();
    const notice = useAppStore((state) => {
        return state.notice;
    });
    const setNotice = useAppStore((state) => {
        return state.setNotice;
    });
    useEffect(() => {
        if (notice?.kind !== 'info') {
            return undefined;
        }
        const timer = setTimeout(() => {
            setNotice(null);
        }, INFO_NOTICE_MS);
        return () => {
            clearTimeout(timer);
        };
    }, [notice, setNotice]);

    if (!notice) {
        return null;
    }
    return (
        <div className={`toast toast--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>
            <span className="toast__message">{notice.message}</span>
            <button
                type="button"
                className="btn btn--small btn--ghost"
                aria-label={t('toast.dismiss')}
                onClick={() => {
                    setNotice(null);
                }}
            >
                ✕
            </button>
        </div>
    );
}
