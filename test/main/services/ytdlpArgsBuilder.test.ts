import { DEFAULT_SETTINGS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { FILE_PRINT_TEMPLATE, PROGRESS_TEMPLATE } from '@main/services/progressParser';
import { buildYtdlpArgs, splitArguments } from '@main/services/ytdlpArgsBuilder';

const URL = 'https://example.com/watch?v=abc';
const DEFAULT_DIR = '/home/u/Downloads';

function build(overrides: Partial<Settings> = {}, ffmpegLocation: string | null = null): string[] {
    return buildYtdlpArgs(URL, { ...DEFAULT_SETTINGS, ...overrides }, DEFAULT_DIR, ffmpegLocation);
}

describe('splitArguments', () => {
    it('splits on whitespace', () => {
        expect(splitArguments('--no-mtime --retries 5')).toEqual(['--no-mtime', '--retries', '5']);
    });

    it('keeps quoted segments together and strips the quotes', () => {
        expect(splitArguments(`--user-agent "My Agent 1.0" --referer 'https://a b'`)).toEqual([
            '--user-agent',
            'My Agent 1.0',
            '--referer',
            'https://a b'
        ]);
    });

    it('returns an empty array for blank input', () => {
        expect(splitArguments('   ')).toEqual([]);
        expect(splitArguments('')).toEqual([]);
    });
});

describe('buildYtdlpArgs', () => {
    it('builds the exact default argument list', () => {
        expect(build()).toEqual([
            '--newline',
            '--no-colors',
            '--progress',
            '--no-simulate',
            '--progress-template',
            PROGRESS_TEMPLATE,
            '--print',
            FILE_PRINT_TEMPLATE,
            '-P',
            DEFAULT_DIR,
            '-o',
            '%(title).80s [%(id)s].%(ext)s',
            '--trim-filenames',
            '240',
            '--no-playlist',
            '-f',
            'bv*+ba/b',
            '--merge-output-format',
            'mp4',
            '--',
            URL
        ]);
    });

    it('always places the URL last after the separator', () => {
        const args = build({ extraArgs: '--no-mtime' });
        expect(args.slice(-2)).toEqual(['--', URL]);
    });

    it('uses the configured download directory over the default', () => {
        const args = build({ downloadDir: '/media/videos' });
        expect(args[args.indexOf('-P') + 1]).toBe('/media/videos');
    });

    it('uses the max title length in the output template', () => {
        const args = build({ maxTitleLength: 120 });
        expect(args[args.indexOf('-o') + 1]).toBe('%(title).120s [%(id)s].%(ext)s');
    });

    it('limits the height when a max resolution is set', () => {
        const args = build({ maxResolution: '720' });
        expect(args[args.indexOf('-f') + 1]).toBe('bv*[height<=720]+ba/b[height<=720]');
    });

    it('uses the selected video container', () => {
        const args = build({ videoContainer: 'mkv' });
        expect(args[args.indexOf('--merge-output-format') + 1]).toBe('mkv');
    });

    it('extracts audio in audio-only mode without merging video', () => {
        const args = build({ audioOnly: true, audioFormat: 'opus', maxResolution: '720' });
        expect(args).toEqual(expect.arrayContaining(['-f', 'ba/b', '-x', '--audio-format', 'opus']));
        expect(args).not.toContain('--merge-output-format');
        expect(args).not.toContain('bv*[height<=720]+ba/b[height<=720]');
    });

    it('adds no cookie arguments when cookies are disabled', () => {
        expect(build({ cookiesBrowser: 'chrome' })).not.toContain('--cookies-from-browser');
    });

    it('adds the browser cookies argument', () => {
        const args = build({ useBrowserCookies: true, cookiesBrowser: 'brave' });
        expect(args[args.indexOf('--cookies-from-browser') + 1]).toBe('brave');
    });

    it('adds the browser profile to the cookies argument', () => {
        const args = build({ useBrowserCookies: true, cookiesBrowser: 'firefox', cookiesProfile: 'work' });
        expect(args[args.indexOf('--cookies-from-browser') + 1]).toBe('firefox:work');
    });

    it('enables playlists', () => {
        const args = build({ downloadPlaylist: true });
        expect(args).toContain('--yes-playlist');
        expect(args).not.toContain('--no-playlist');
    });

    it('adds subtitle arguments', () => {
        const args = build({ writeSubtitles: true, subtitleLangs: 'en,pt' });
        expect(args).toEqual(expect.arrayContaining(['--write-subs', '--sub-langs', 'en,pt']));
        expect(args).not.toContain('--embed-subs');
    });

    it('embeds subtitles when requested', () => {
        expect(build({ writeSubtitles: true, embedSubtitles: true })).toContain('--embed-subs');
    });

    it('requests all subtitle languages when none is configured', () => {
        const args = build({ writeSubtitles: true, subtitleLangs: '' });
        expect(args[args.indexOf('--sub-langs') + 1]).toBe('all');
    });

    it('ignores subtitle options when subtitles are disabled', () => {
        const args = build({ writeSubtitles: false, embedSubtitles: true });
        expect(args).not.toContain('--write-subs');
        expect(args).not.toContain('--embed-subs');
    });

    it('adds restrict-filenames, rate limit and the resolved ffmpeg location', () => {
        const args = build({ restrictFilenames: true, rateLimit: '2M' }, '/opt/ffmpeg');
        expect(args).toContain('--restrict-filenames');
        expect(args[args.indexOf('-r') + 1]).toBe('2M');
        expect(args[args.indexOf('--ffmpeg-location') + 1]).toBe('/opt/ffmpeg');
    });

    it('does not add the ffmpeg location when none was resolved', () => {
        expect(build({ ffmpegPath: '/ignored/here' }, null)).not.toContain('--ffmpeg-location');
    });

    it('defaults the ffmpeg location to none', () => {
        expect(buildYtdlpArgs(URL, DEFAULT_SETTINGS, DEFAULT_DIR)).not.toContain('--ffmpeg-location');
    });

    it('adds the JavaScript runtime argument', () => {
        const args = build({ jsRuntime: 'node:/usr/bin/node' });
        expect(args[args.indexOf('--js-runtimes') + 1]).toBe('node:/usr/bin/node');
    });

    it('omits optional flags by default', () => {
        const args = build();
        expect(args).not.toContain('--restrict-filenames');
        expect(args).not.toContain('-r');
        expect(args).not.toContain('--ffmpeg-location');
        expect(args).not.toContain('--js-runtimes');
    });

    it('appends parsed extra arguments before the URL separator', () => {
        const args = build({ extraArgs: '--retries 5 --user-agent "My Agent"' });
        expect(args.slice(-6)).toEqual(['--retries', '5', '--user-agent', 'My Agent', '--', URL]);
    });
});
