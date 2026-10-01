import { chosenBrowserWarning, findChosenBrowser, NO_BROWSER_CHOSEN } from '@shared/browserChoice';
import type { DetectedBrowser } from '@shared/types';

const ORIGIN: DetectedBrowser = {
    label: 'Brave Origin',
    engine: 'brave',
    dataDir: '/home/a/.config/BraveSoftware/Brave-Origin',
    profiles: [{ id: 'Default', name: 'Personal' }]
};
const FIREFOX: DetectedBrowser = {
    label: 'Firefox',
    engine: 'firefox',
    dataDir: '/home/a/.mozilla/firefox',
    profiles: [{ id: 'abc.default', name: 'default' }]
};

describe('findChosenBrowser', () => {
    it('matches the detected browser by its folder', () => {
        expect(findChosenBrowser([FIREFOX, ORIGIN], { cookiesBrowserDir: ORIGIN.dataDir })).toEqual(ORIGIN);
    });

    it('does not match a folder that was not detected', () => {
        expect(findChosenBrowser([FIREFOX], { cookiesBrowserDir: ORIGIN.dataDir })).toBeNull();
    });

    it('does not match a choice saved without a folder', () => {
        expect(findChosenBrowser([FIREFOX], { cookiesBrowserDir: '' })).toBeNull();
    });

    it('uses an empty value for "no browser chosen"', () => {
        expect(NO_BROWSER_CHOSEN).toBe('');
    });
});

describe('chosenBrowserWarning', () => {
    const SAVED = { useBrowserCookies: true, cookiesBrowser: 'brave' as const, cookiesBrowserDir: '' };

    it('says nothing before the browsers are known', () => {
        expect(chosenBrowserWarning(null, SAVED)).toBeNull();
    });

    it('says nothing when the cookies are not used', () => {
        expect(chosenBrowserWarning([], { ...SAVED, useBrowserCookies: false })).toBeNull();
    });

    it('says that no browser was found', () => {
        expect(chosenBrowserWarning([], SAVED)).toBe('No browser with saved cookies was found on this system.');
    });

    it('says that the saved browser was not found among the detected ones', () => {
        expect(chosenBrowserWarning([FIREFOX], SAVED)).toBe(
            'The saved browser (brave) was not found on this system. Choose one of the detected browsers.'
        );
    });

    it('says nothing when the saved browser is among the detected ones', () => {
        expect(chosenBrowserWarning([ORIGIN], { ...SAVED, cookiesBrowserDir: ORIGIN.dataDir })).toBeNull();
    });
});
