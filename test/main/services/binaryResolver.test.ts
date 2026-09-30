import { delimiter, join } from 'node:path';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { BinaryResolver, executableName } from '@main/services/binaryResolver';

const BUNDLED = '/app/resources/bin';
const USER_BIN = '/data/bin';

function makeResolver(existing: string[]): BinaryResolver {
    return new BinaryResolver({ bundledDir: BUNDLED, userBinDir: USER_BIN }, (path) => {
        return existing.includes(path);
    });
}

describe('BinaryResolver.ytdlp', () => {
    it('prefers the custom path from the settings', () => {
        const resolver = makeResolver([join(USER_BIN, 'yt-dlp'), join(BUNDLED, 'yt-dlp')]);
        expect(resolver.ytdlp({ ...DEFAULT_SETTINGS, ytdlpPath: '/opt/yt-dlp' })).toEqual({ path: '/opt/yt-dlp', source: 'custom' });
    });

    it('uses the updated binary from the user data folder over the bundled one', () => {
        const resolver = makeResolver([join(USER_BIN, 'yt-dlp'), join(BUNDLED, 'yt-dlp')]);
        expect(resolver.ytdlp(DEFAULT_SETTINGS)).toEqual({ path: '/data/bin/yt-dlp', source: 'updated' });
    });

    it('uses the bundled binary when there is no updated one', () => {
        const resolver = makeResolver([join(BUNDLED, 'yt-dlp')]);
        expect(resolver.ytdlp(DEFAULT_SETTINGS)).toEqual({ path: '/app/resources/bin/yt-dlp', source: 'bundled' });
    });

    it('falls back to the system command', () => {
        expect(makeResolver([]).ytdlp(DEFAULT_SETTINGS)).toEqual({ path: 'yt-dlp', source: 'system' });
    });

    it('exposes the user yt-dlp path and folder', () => {
        const resolver = makeResolver([]);
        expect(resolver.userYtdlpPath).toBe('/data/bin/yt-dlp');
        expect(resolver.userBinDir).toBe('/data/bin');
    });
});

describe('BinaryResolver.ffmpeg / ffmpegLocation', () => {
    it('prefers the custom ffmpeg path and passes it as the location', () => {
        const resolver = makeResolver([join(BUNDLED, 'ffmpeg')]);
        const settings = { ...DEFAULT_SETTINGS, ffmpegPath: '/opt/ffmpeg' };
        expect(resolver.ffmpeg(settings)).toEqual({ path: '/opt/ffmpeg', source: 'custom' });
        expect(resolver.ffmpegLocation(settings)).toBe('/opt/ffmpeg');
    });

    it('uses the bundled ffmpeg and passes its folder as the location', () => {
        const resolver = makeResolver([join(BUNDLED, 'ffmpeg')]);
        expect(resolver.ffmpeg(DEFAULT_SETTINGS)).toEqual({ path: '/app/resources/bin/ffmpeg', source: 'bundled' });
        expect(resolver.ffmpegLocation(DEFAULT_SETTINGS)).toBe(BUNDLED);
    });

    it('falls back to the system ffmpeg with no explicit location', () => {
        const resolver = makeResolver([]);
        expect(resolver.ffmpeg(DEFAULT_SETTINGS)).toEqual({ path: 'ffmpeg', source: 'system' });
        expect(resolver.ffmpegLocation(DEFAULT_SETTINGS)).toBeNull();
    });
});

describe('BinaryResolver.spawnEnv', () => {
    it('prepends the bundled folder to PATH when it exists', () => {
        const resolver = makeResolver([BUNDLED]);
        expect(resolver.spawnEnv({ PATH: '/usr/bin', HOME: '/home/u' })).toEqual({ PATH: `${BUNDLED}:/usr/bin`, HOME: '/home/u' });
    });

    it('uses only the bundled folder when PATH is unset', () => {
        expect(makeResolver([BUNDLED]).spawnEnv({})).toEqual({ PATH: BUNDLED });
    });

    it('returns the base environment untouched when the bundled folder is missing', () => {
        const base = { PATH: '/usr/bin' };
        expect(makeResolver([]).spawnEnv(base)).toBe(base);
    });

    it('defaults to process.env', () => {
        expect(makeResolver([]).spawnEnv()).toBe(process.env);
    });
});

describe('executableName', () => {
    it('adds the .exe extension on Windows only', () => {
        expect(executableName('yt-dlp', 'win32')).toBe('yt-dlp.exe');
        expect(executableName('ffmpeg', 'win32')).toBe('ffmpeg.exe');
        expect(executableName('yt-dlp', 'linux')).toBe('yt-dlp');
        expect(executableName('yt-dlp', 'darwin')).toBe('yt-dlp');
    });

    it('defaults to the current platform', () => {
        expect(executableName('yt-dlp')).toBe(process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    });
});

describe('BinaryResolver on Windows', () => {
    function makeWindowsResolver(existing: string[]): BinaryResolver {
        return new BinaryResolver(
            { bundledDir: BUNDLED, userBinDir: USER_BIN },
            (path) => {
                return existing.includes(path);
            },
            'win32'
        );
    }

    it('looks for yt-dlp.exe in the user folder and the bundled folder', () => {
        const userExe = join(USER_BIN, 'yt-dlp.exe');
        const bundledExe = join(BUNDLED, 'yt-dlp.exe');
        expect(makeWindowsResolver([userExe, bundledExe]).ytdlp(DEFAULT_SETTINGS)).toEqual({ path: userExe, source: 'updated' });
        expect(makeWindowsResolver([bundledExe]).ytdlp(DEFAULT_SETTINGS)).toEqual({ path: bundledExe, source: 'bundled' });
        expect(makeWindowsResolver([]).userYtdlpPath).toBe(join(USER_BIN, 'yt-dlp.exe'));
    });

    it('ignores extension-less files that would only exist on Linux', () => {
        expect(makeWindowsResolver([join(BUNDLED, 'yt-dlp'), join(USER_BIN, 'yt-dlp')]).ytdlp(DEFAULT_SETTINGS)).toEqual({
            path: 'yt-dlp',
            source: 'system'
        });
    });

    it('uses the bundled ffmpeg.exe and passes its folder as the location', () => {
        const bundledExe = join(BUNDLED, 'ffmpeg.exe');
        const resolver = makeWindowsResolver([bundledExe]);
        expect(resolver.ffmpeg(DEFAULT_SETTINGS)).toEqual({ path: bundledExe, source: 'bundled' });
        expect(resolver.ffmpegLocation(DEFAULT_SETTINGS)).toBe(BUNDLED);
    });

    it('falls back to the plain command names, which Windows resolves through PATHEXT', () => {
        const resolver = makeWindowsResolver([]);
        expect(resolver.ytdlp(DEFAULT_SETTINGS)).toEqual({ path: 'yt-dlp', source: 'system' });
        expect(resolver.ffmpeg(DEFAULT_SETTINGS)).toEqual({ path: 'ffmpeg', source: 'system' });
    });

    it('extends the existing "Path" variable instead of adding a second PATH key', () => {
        const env = makeWindowsResolver([BUNDLED]).spawnEnv({ Path: 'C:\\Windows', SystemRoot: 'C:\\Windows' });
        expect(env).toEqual({ Path: `${BUNDLED}${delimiter}C:\\Windows`, SystemRoot: 'C:\\Windows' });
        expect(Object.keys(env)).not.toContain('PATH');
    });

    it('creates PATH when the environment has none', () => {
        expect(makeWindowsResolver([BUNDLED]).spawnEnv({})).toEqual({ PATH: BUNDLED });
    });
});

