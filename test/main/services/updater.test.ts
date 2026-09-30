import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { BinaryResolver } from '@main/services/binaryResolver';
import {
    defaultUpdateExec,
    defaultUpdaterDependencies,
    parseChecksum,
    updateYtdlp,
    type UpdaterDependencies
} from '@main/services/updater';
import { cleanTempDirs, makeTempDir } from '../../helpers/tempDir';

afterEach(() => {
    cleanTempDirs();
    vi.unstubAllGlobals();
});

const RELEASE_API = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const BASE = 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.09.01';
const BINARY = Buffer.from('#!/bin/sh\necho new\n');
const BINARY_HASH = createHash('sha256').update(BINARY).digest('hex');

function makeResolver(userBinDir: string, platform: NodeJS.Platform = 'linux'): BinaryResolver {
    return new BinaryResolver({ bundledDir: '/nonexistent-bundled', userBinDir }, () => {
        return false;
    }, platform);
}

function makeDeps(overrides: Partial<UpdaterDependencies> = {}): UpdaterDependencies {
    return {
        exec: vi.fn(async () => {
            return { ok: true, output: '2026.08.19\n' };
        }),
        fetchText: vi.fn(async (url: string) => {
            return url === RELEASE_API ? JSON.stringify({ tag_name: '2026.09.01' }) : `${BINARY_HASH}  yt-dlp_linux\nabc  yt-dlp\n`;
        }),
        fetchBuffer: vi.fn(async () => {
            return BINARY;
        }),
        ...overrides
    };
}

describe('parseChecksum', () => {
    it('finds the hash for a file name, lowercased', () => {
        expect(parseChecksum('AAA  yt-dlp\nBBB  yt-dlp_linux\n', 'yt-dlp_linux')).toBe('bbb');
    });

    it('returns null when the file is not listed', () => {
        expect(parseChecksum('AAA  yt-dlp\n', 'yt-dlp_linux')).toBeNull();
        expect(parseChecksum('', 'yt-dlp_linux')).toBeNull();
    });
});

describe('updateYtdlp with a custom path', () => {
    it('runs -U on the custom binary and returns its result', async () => {
        const deps = makeDeps({
            exec: vi.fn(async () => {
                return { ok: false, output: 'Permission denied' };
            })
        });
        const result = await updateYtdlp({ ...DEFAULT_SETTINGS, ytdlpPath: '/opt/yt-dlp' }, makeResolver(makeTempDir()), deps);
        expect(result).toEqual({ ok: false, output: 'Permission denied' });
        expect(deps.exec).toHaveBeenCalledWith('/opt/yt-dlp', ['-U']);
        expect(deps.fetchText).not.toHaveBeenCalled();
    });
});

describe('updateYtdlp downloading the latest release', () => {
    it('downloads, verifies and installs a newer version into the user folder', async () => {
        const dir = makeTempDir();
        const deps = makeDeps();
        const result = await updateYtdlp(DEFAULT_SETTINGS, makeResolver(dir), deps);
        expect(result).toEqual({ ok: true, output: 'Updated yt-dlp 2026.08.19 → 2026.09.01.' });
        expect(deps.fetchText).toHaveBeenCalledWith(RELEASE_API);
        expect(deps.fetchText).toHaveBeenCalledWith(`${BASE}/SHA2-256SUMS`);
        expect(deps.fetchBuffer).toHaveBeenCalledWith(`${BASE}/yt-dlp_linux`);
        const target = join(dir, 'yt-dlp');
        expect(readFileSync(target)).toEqual(BINARY);
        expect(statSync(target).mode & 0o777).toBe(0o755);
        expect(existsSync(`${target}.tmp`)).toBe(false);
    });

    it('creates the user folder when it does not exist yet', async () => {
        const dir = join(makeTempDir(), 'nested', 'bin');
        await updateYtdlp(DEFAULT_SETTINGS, makeResolver(dir), makeDeps());
        expect(existsSync(join(dir, 'yt-dlp'))).toBe(true);
    });

    it('does nothing when already on the latest version', async () => {
        const dir = makeTempDir();
        const deps = makeDeps({
            exec: vi.fn(async () => {
                return { ok: true, output: '2026.09.01\n' };
            })
        });
        await expect(updateYtdlp(DEFAULT_SETTINGS, makeResolver(dir), deps)).resolves.toEqual({
            ok: true,
            output: 'yt-dlp is already up to date (2026.09.01).'
        });
        expect(deps.fetchBuffer).not.toHaveBeenCalled();
        expect(existsSync(join(dir, 'yt-dlp'))).toBe(false);
    });

    it('reports an unknown current version', async () => {
        const deps = makeDeps({
            exec: vi.fn(async () => {
                return { ok: false, output: 'not found' };
            })
        });
        const result = await updateYtdlp(DEFAULT_SETTINGS, makeResolver(makeTempDir()), deps);
        expect(result).toEqual({ ok: true, output: 'Updated yt-dlp unknown → 2026.09.01.' });
    });

    it('discards the download when the checksum does not match', async () => {
        const dir = makeTempDir();
        const deps = makeDeps({
            fetchBuffer: vi.fn(async () => {
                return Buffer.from('tampered');
            })
        });
        await expect(updateYtdlp(DEFAULT_SETTINGS, makeResolver(dir), deps)).resolves.toEqual({
            ok: false,
            output: 'Checksum verification failed. The download was discarded.'
        });
        expect(existsSync(join(dir, 'yt-dlp'))).toBe(false);
    });

    it('fails when the checksum for the asset is missing', async () => {
        const deps = makeDeps({
            fetchText: vi.fn(async (url: string) => {
                return url === RELEASE_API ? JSON.stringify({ tag_name: '2026.09.01' }) : 'abc  something-else\n';
            })
        });
        const result = await updateYtdlp(DEFAULT_SETTINGS, makeResolver(makeTempDir()), deps);
        expect(result.ok).toBe(false);
        expect(result.output).toBe('Checksum verification failed. The download was discarded.');
    });

    it('fails when the latest version cannot be determined', async () => {
        const deps = makeDeps({
            fetchText: vi.fn(async () => {
                return JSON.stringify({});
            })
        });
        await expect(updateYtdlp(DEFAULT_SETTINGS, makeResolver(makeTempDir()), deps)).resolves.toEqual({
            ok: false,
            output: 'Could not determine the latest yt-dlp version.'
        });
    });

    it('returns the error message when a request fails', async () => {
        const deps = makeDeps({
            fetchText: vi.fn(async () => {
                throw new Error('network down');
            })
        });
        await expect(updateYtdlp(DEFAULT_SETTINGS, makeResolver(makeTempDir()), deps)).resolves.toEqual({ ok: false, output: 'network down' });
    });

    it('returns a generic message for non-Error failures', async () => {
        const deps = makeDeps({
            fetchText: vi.fn(async () => {
                throw 'oops';
            })
        });
        await expect(updateYtdlp(DEFAULT_SETTINGS, makeResolver(makeTempDir()), deps)).resolves.toEqual({ ok: false, output: 'Update failed.' });
    });
});

describe('updateYtdlp on other platforms', () => {
    it('downloads yt-dlp.exe, verifies it against its own checksum line and installs it as yt-dlp.exe on Windows', async () => {
        const dir = makeTempDir();
        const deps = makeDeps({
            fetchText: vi.fn(async (url: string) => {
                return url === RELEASE_API ? JSON.stringify({ tag_name: '2026.09.01' }) : `deadbeef  yt-dlp_linux\n${BINARY_HASH}  yt-dlp.exe\n`;
            })
        });
        const result = await updateYtdlp(DEFAULT_SETTINGS, makeResolver(dir, 'win32'), deps, 'win32');
        expect(result).toEqual({ ok: true, output: 'Updated yt-dlp 2026.08.19 → 2026.09.01.' });
        expect(deps.fetchBuffer).toHaveBeenCalledWith(`${BASE}/yt-dlp.exe`);
        expect(readFileSync(join(dir, 'yt-dlp.exe'))).toEqual(BINARY);
        expect(existsSync(join(dir, 'yt-dlp'))).toBe(false);
    });

    it('refuses the Windows asset when only the Linux checksum matches', async () => {
        const dir = makeTempDir();
        const deps = makeDeps();
        const result = await updateYtdlp(DEFAULT_SETTINGS, makeResolver(dir, 'win32'), deps, 'win32');
        expect(result).toEqual({ ok: false, output: 'Checksum verification failed. The download was discarded.' });
        expect(existsSync(join(dir, 'yt-dlp.exe'))).toBe(false);
    });

    it('reports platforms without a known yt-dlp build', async () => {
        const deps = makeDeps();
        await expect(updateYtdlp(DEFAULT_SETTINGS, makeResolver(makeTempDir()), deps, 'darwin')).resolves.toEqual({
            ok: false,
            output: 'Updating yt-dlp is not supported on darwin.'
        });
        expect(deps.fetchText).not.toHaveBeenCalled();
    });
});

describe('defaultUpdaterDependencies', () => {
    it('fetches text and buffers with a user agent', async () => {
        const fetchMock = vi.fn(async () => {
            return new Response('hello', { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);
        await expect(defaultUpdaterDependencies.fetchText('https://x.test/a')).resolves.toBe('hello');
        await expect(defaultUpdaterDependencies.fetchBuffer('https://x.test/b')).resolves.toEqual(Buffer.from('hello'));
        expect(fetchMock).toHaveBeenCalledWith('https://x.test/a', { headers: { 'User-Agent': 'cyber-downloader' }, redirect: 'follow' });
        expect(fetchMock).toHaveBeenCalledWith('https://x.test/b', { headers: { 'User-Agent': 'cyber-downloader' }, redirect: 'follow' });
    });

    it('rejects on a non-ok response', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            return new Response('nope', { status: 404 });
        }));
        await expect(defaultUpdaterDependencies.fetchText('https://x.test/missing')).rejects.toThrow('Request failed (404) for https://x.test/missing');
    });
});

describe('defaultUpdateExec', () => {
    it('resolves ok with the combined output on success', async () => {
        await expect(defaultUpdateExec(process.execPath, ['-e', 'process.stdout.write("out")'])).resolves.toEqual({ ok: true, output: 'out' });
    });

    it('resolves not ok with stderr on failure', async () => {
        const result = await defaultUpdateExec(process.execPath, ['-e', 'process.stderr.write("bad");process.exit(1)']);
        expect(result.ok).toBe(false);
        expect(result.output).toBe('bad');
    });

    it('resolves not ok with the error message when the binary is missing', async () => {
        const result = await defaultUpdateExec('/nonexistent/binary', []);
        expect(result.ok).toBe(false);
        expect(result.output).toContain('ENOENT');
    });
});
