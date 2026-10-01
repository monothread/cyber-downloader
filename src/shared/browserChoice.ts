import type { DetectedBrowser, Settings } from '@shared/types';

export const NO_BROWSER_CHOSEN = '';

// A choice saved before browsers were detected has no folder, so it cannot be matched to a detected browser.
export function findChosenBrowser(browsers: readonly DetectedBrowser[], settings: Pick<Settings, 'cookiesBrowserDir'>): DetectedBrowser | null {
    if (settings.cookiesBrowserDir.length === 0) {
        return null;
    }
    return (
        browsers.find((browser) => {
            return browser.dataDir === settings.cookiesBrowserDir;
        }) ?? null
    );
}

export function chosenBrowserWarning(browsers: readonly DetectedBrowser[] | null, settings: Pick<Settings, 'useBrowserCookies' | 'cookiesBrowser' | 'cookiesBrowserDir'>): string | null {
    if (browsers === null || !settings.useBrowserCookies) {
        return null;
    }
    if (browsers.length === 0) {
        return 'No browser with saved cookies was found on this system.';
    }
    if (findChosenBrowser(browsers, settings) !== null) {
        return null;
    }
    return `The saved browser (${settings.cookiesBrowser}) was not found on this system. Choose one of the detected browsers.`;
}
