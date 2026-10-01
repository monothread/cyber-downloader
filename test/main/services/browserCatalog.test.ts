import { BrowserCatalog } from '@main/services/browserCatalog';
import type { DetectedBrowser } from '@shared/types';

const FIREFOX: DetectedBrowser = {
    label: 'Firefox',
    engine: 'firefox',
    dataDir: '/home/a/.mozilla/firefox',
    profiles: [{ id: 'abc.default', name: 'default' }]
};
const ORIGIN: DetectedBrowser = {
    label: 'Brave Origin',
    engine: 'brave',
    dataDir: '/home/a/.config/BraveSoftware/Brave-Origin',
    profiles: [{ id: 'Default', name: 'Personal' }]
};

describe('BrowserCatalog', () => {
    it('scans as soon as it is created', () => {
        const detect = vi.fn(async () => {
            return [FIREFOX];
        });
        new BrowserCatalog(detect);
        expect(detect).toHaveBeenCalledTimes(1);
    });

    it('returns the first scan without scanning again', async () => {
        const detect = vi.fn(async () => {
            return [FIREFOX];
        });
        const catalog = new BrowserCatalog(detect);
        await expect(catalog.list()).resolves.toEqual([FIREFOX]);
        await expect(catalog.list(false)).resolves.toEqual([FIREFOX]);
        expect(detect).toHaveBeenCalledTimes(1);
    });

    it('scans again on refresh and keeps the new result', async () => {
        const detect = vi.fn<() => Promise<DetectedBrowser[]>>().mockResolvedValueOnce([FIREFOX]).mockResolvedValueOnce([FIREFOX, ORIGIN]);
        const catalog = new BrowserCatalog(detect);
        await expect(catalog.list(true)).resolves.toEqual([FIREFOX, ORIGIN]);
        await expect(catalog.list()).resolves.toEqual([FIREFOX, ORIGIN]);
        expect(detect).toHaveBeenCalledTimes(2);
    });

    it('returns an empty list when the scan fails', async () => {
        const catalog = new BrowserCatalog(async () => {
            throw new Error('permission denied');
        });
        await expect(catalog.list()).resolves.toEqual([]);
    });
});
