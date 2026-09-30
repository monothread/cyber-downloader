export const BRIDGE_MISSING_TITLE = 'THE INTERFACE COULD NOT CONNECT TO THE APP';

// Shown instead of the app when the preload did not load: without `window.api` no button could work.
export function BridgeMissing() {
    return (
        <div className="app">
            <h1 className="logo" data-text="CYBER//DL">
                CYBER//DL
            </h1>
            <div className="error-banner" role="alert">
                <p className="error-banner__title">{BRIDGE_MISSING_TITLE}</p>
                <p className="error-banner__hint">
                    The buttons cannot work until this is fixed. Close the app and open it again; if it keeps happening, reinstall it and send the file
                    diagnostic.log from the app data folder (on Windows: %APPDATA%\cyber-downloader).
                </p>
            </div>
        </div>
    );
}
