import { useTranslator } from '../i18n/useTranslator';
import { useAppStore } from '../store/appStore';

export function Toast() {
    const t = useTranslator();
    const notice = useAppStore((state) => {
        return state.notice;
    });
    const setNotice = useAppStore((state) => {
        return state.setNotice;
    });
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
