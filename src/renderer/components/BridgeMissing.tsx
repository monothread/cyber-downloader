import { useTranslator } from '../i18n/useTranslator';

// Shown instead of the app when the preload did not load: without `window.api` no button could work.
export function BridgeMissing() {
    const t = useTranslator();
    return (
        <div className="app">
            <h1 className="logo" data-text="CYBER//DL">
                CYBER//DL
            </h1>
            <div className="error-banner" role="alert">
                <p className="error-banner__title">{t('bridge.title')}</p>
                <p className="error-banner__hint">{t('bridge.hint')}</p>
            </div>
        </div>
    );
}
