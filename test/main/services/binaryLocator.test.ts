import { DEFAULT_SETTINGS } from '@shared/constants';
import { checkBinaries, defaultExecFile, parseFfmpegVersion } from '@main/services/binaryLocator';
import { BinaryResolver } from '@main/services/binaryResolver';

function makeResolver(existing: string[] = []): BinaryResolver {
    return new BinaryResolver({ bundledDir: '/b', userBinDir: '/u' }, (path) => {
        return existing.includes(path);
    });
}

describe('parseFfmpegVersion', () => {
    it('reads the version from the first line', () => {
        expect(parseFfmpegVersion('ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023\nbuilt with gcc')).toBe('6.1.1-3ubuntu5');
    });

    it('returns null when no version is present', () => {
        expect(parseFfmpegVersion('garbage')).toBeNull();
        expect(parseFfmpegVersion('')).toBeNull();
    });
});

describe('checkBinaries', () => {
    it('reports both system binaries as found with their versions', async () => {
        const exec = vi.fn(async (file: string) => {
            return file === 'yt-dlp' ? '2026.08.19\n' : 'ffmpeg version 7.0 Copyright';
        });
        await expect(checkBinaries(DEFAULT_SETTINGS, makeResolver(), exec)).resolves.toEqual({
            ytdlp: { found: true, path: 'yt-dlp', version: '2026.08.19', source: 'system' },
            ffmpeg: { found: true, path: 'ffmpeg', version: '7.0', source: 'system' }
        });
        expect(exec).toHaveBeenCalledWith('yt-dlp', ['--version']);
        expect(exec).toHaveBeenCalledWith('ffmpeg', ['-version']);
    });

    it('probes the bundled and updated binaries with their sources', async () => {
        const exec = vi.fn(async () => {
            return '1.0';
        });
        const resolver = makeResolver(['/u/yt-dlp', '/b/ffmpeg']);
        await expect(checkBinaries(DEFAULT_SETTINGS, resolver, exec)).resolves.toEqual({
            ytdlp: { found: true, path: '/u/yt-dlp', version: '1.0', source: 'updated' },
            ffmpeg: { found: true, path: '/b/ffmpeg', version: null, source: 'bundled' }
        });
        expect(exec).toHaveBeenCalledWith('/u/yt-dlp', ['--version']);
        expect(exec).toHaveBeenCalledWith('/b/ffmpeg', ['-version']);
    });

    it('reports missing binaries', async () => {
        const exec = vi.fn(async () => {
            throw new Error('ENOENT');
        });
        await expect(checkBinaries(DEFAULT_SETTINGS, makeResolver(), exec)).resolves.toEqual({
            ytdlp: { found: false, path: 'yt-dlp', version: null, source: 'system' },
            ffmpeg: { found: false, path: 'ffmpeg', version: null, source: 'system' }
        });
    });

    it('probes the custom paths', async () => {
        const exec = vi.fn(async () => {
            return '1.0';
        });
        const settings = { ...DEFAULT_SETTINGS, ytdlpPath: '/x/yt', ffmpegPath: '/x/ff' };
        const status = await checkBinaries(settings, makeResolver(), exec);
        expect(exec).toHaveBeenCalledWith('/x/yt', ['--version']);
        expect(exec).toHaveBeenCalledWith('/x/ff', ['-version']);
        expect(status.ytdlp).toMatchObject({ path: '/x/yt', source: 'custom' });
        expect(status.ffmpeg).toMatchObject({ path: '/x/ff', source: 'custom' });
    });

    it('reports a null version for empty yt-dlp output', async () => {
        const exec = vi.fn(async () => {
            return '  \n';
        });
        expect((await checkBinaries(DEFAULT_SETTINGS, makeResolver(), exec)).ytdlp).toEqual({
            found: true,
            path: 'yt-dlp',
            version: null,
            source: 'system'
        });
    });
});

describe('defaultExecFile', () => {
    it('resolves with stdout', async () => {
        await expect(defaultExecFile(process.execPath, ['-e', 'process.stdout.write("hi")'])).resolves.toBe('hi');
    });

    it('rejects when the command fails', async () => {
        await expect(defaultExecFile(process.execPath, ['-e', 'process.exit(2)'])).rejects.toBeInstanceOf(Error);
    });

    it('rejects when the binary does not exist', async () => {
        await expect(defaultExecFile('/nonexistent/binary', [])).rejects.toBeInstanceOf(Error);
    });
});
