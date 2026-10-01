import { findRegisteredBrowser, normalizeBrowserKey, type RegisteredBrowser } from '@main/services/browserIdentity';

describe('normalizeBrowserKey', () => {
    it.each([
        ['google-chrome-stable', 'googlechrome'],
        ['Google Chrome', 'googlechrome'],
        ['google-chrome', 'googlechrome'],
        ['brave-browser', 'brave'],
        ['Brave-Browser', 'brave'],
        ['brave-origin-stable', 'braveorigin'],
        ['chromium-browser', 'chromium'],
        ['microsoft-edge-beta', 'microsoftedge'],
        ['firefox', 'firefox'],
        ['browser', 'browser'],
        ['', '']
    ])('turns "%s" into "%s"', (text, expected) => {
        expect(normalizeBrowserKey(text)).toBe(expected);
    });
});

describe('findRegisteredBrowser', () => {
    const REGISTERED: RegisteredBrowser[] = [
        { name: 'Brave', key: 'brave-browser' },
        { name: 'Brave Origin', key: 'brave-origin-stable' },
        { name: 'Chromium Web Browser', key: 'chromium-browser' },
        { name: 'Google Chrome', key: 'google-chrome-stable' },
        { name: 'Firefox Web Browser', key: 'firefox' }
    ];

    it.each([
        ['/home/a/.config/BraveSoftware/Brave-Browser', 'Brave'],
        ['/home/a/.config/BraveSoftware/Brave-Origin', 'Brave Origin'],
        ['/home/a/.config/chromium', 'Chromium Web Browser'],
        ['/home/a/.config/google-chrome', 'Google Chrome'],
        ['/home/a/.config/mozilla/firefox', 'Firefox Web Browser']
    ])('matches %s with %s', (dataDir, name) => {
        expect(findRegisteredBrowser(dataDir, REGISTERED)?.name).toBe(name);
    });

    it('uses the folder above "User Data" on Windows', () => {
        const registered = [{ name: 'Google Chrome', key: 'Chrome' }];
        expect(findRegisteredBrowser('C:\\Users\\a\\AppData\\Local\\Google\\Chrome\\User Data', registered)?.name).toBe('Google Chrome');
    });

    it('does not mix up two products with similar names', () => {
        expect(findRegisteredBrowser('/home/a/.config/chromium', [{ name: 'Google Chrome', key: 'google-chrome' }])).toBeNull();
        expect(findRegisteredBrowser('/home/a/.config/BraveSoftware/Brave-Origin', [{ name: 'Brave', key: 'brave-browser' }])).toBeNull();
    });

    it('finds nothing without registrations or for an empty folder name', () => {
        expect(findRegisteredBrowser('/home/a/.config/chromium', [])).toBeNull();
        expect(findRegisteredBrowser('/', REGISTERED)).toBeNull();
    });
});
