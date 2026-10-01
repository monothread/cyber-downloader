import { buildRelaunchOptions } from '@main/services/relaunch';

describe('buildRelaunchOptions', () => {
    const ARGV = ['/usr/lib/cyber-downloader/cyber-downloader', '--no-sandbox', '--user-data-dir=/tmp/x'];

    it('keeps the command line arguments without the executable', () => {
        expect(buildRelaunchOptions({}, ARGV)).toEqual({ args: ['--no-sandbox', '--user-data-dir=/tmp/x'] });
    });

    it('starts an AppImage again through the .AppImage file', () => {
        expect(buildRelaunchOptions({ APPIMAGE: '/home/a/Apps/cyber-downloader.AppImage' }, ARGV)).toEqual({
            execPath: '/home/a/Apps/cyber-downloader.AppImage',
            args: ['--no-sandbox', '--user-data-dir=/tmp/x']
        });
    });

    it('ignores an empty APPIMAGE variable', () => {
        expect(buildRelaunchOptions({ APPIMAGE: '' }, ARGV)).toEqual({ args: ['--no-sandbox', '--user-data-dir=/tmp/x'] });
    });

    it('returns no arguments when the app was started without any', () => {
        expect(buildRelaunchOptions({}, ['/usr/bin/app'])).toEqual({ args: [] });
    });
});
