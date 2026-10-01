import { useTranslator } from '../i18n/useTranslator';
import { useAppStore } from '../store/appStore';

export function UpdateActions() {
    const t = useTranslator();
    const status = useAppStore((state) => {
        return state.appUpdate.status;
    });
    const version = useAppStore((state) => {
        return state.appUpdate.version;
    });
    const downloadAppUpdate = useAppStore((state) => {
        return state.downloadAppUpdate;
    });
    const installAppUpdate = useAppStore((state) => {
        return state.installAppUpdate;
    });

    if (status === 'available') {
        return (
            <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => {
                    void downloadAppUpdate();
                }}
            >
                {t('update.updateTo', { version: version ?? '' })}
            </button>
        );
    }
    if (status === 'downloaded') {
        return (
            <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => {
                    void installAppUpdate();
                }}
            >
                {t('update.restartInstall')}
            </button>
        );
    }
    return null;
}
