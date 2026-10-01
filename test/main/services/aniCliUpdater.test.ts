import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyLanguage } from '@main/services/language';
import { executableName } from '@main/services/binaryResolver';
import { AniCliLocator, type AniLocations, type AniToolsFs } from '@main/services/aniCliLocator';
import {
    COMMIT_API_URL,
    createDefaultUpdaterDependencies,
    defaultFetchText,
    MAX_SCRIPT_BYTES,
    RAW_SCRIPT_URL,
    updateAniCli,
    type AniCliUpdaterDependencies
} from '@main/services/aniCliUpdater';
import { cleanTempDirs, makeTempDir } from '../../helpers/tempDir';

const BUSYBOX = join(__dirname, '../../../resources/bin/ani', executableName('busybox'));
const SHA = 'a'.repeat(40);
const LOCATIONS: AniLocations = { bundledDir: '/app/resources/bin', scriptsDir: '/app/scripts', userBinDir: '/data/bin', dataDir: '/data/anime' };
const BUNDLED = '/app/resources/bin/ani/ani-cli';
const script = (version: string, extra = ''): string => {
    return `#!/bin/sh\nversion_number="${version}"\n${extra}`;
};

beforeEach(() => {
    applyLanguage('en', 'en-US');
});

afterEach(() => {
    cleanTempDirs();
    vi.restoreAllMocks();
});

function setup(options: { installed?: string | null; latest?: string; commit?: string; syntaxOk?: boolean; fetchFails?: boolean } = {}) {
    const texts = new Map<string, string>();
    if (options.installed !== null) {
        texts.set(BUNDLED, options.installed ?? script('5.1.4'));
    }
    const fs: AniToolsFs = {
        exists: (path) => {
            return texts.has(path) && path === BUNDLED;
        },
        mkdir: () => {
            return undefined;
        },
        symlink: () => {
            return undefined;
        },
        readlink: () => {
            return null;
        },
        remove: () => {
            return undefined;
        },
        readText: (path) => {
            return texts.get(path) ?? null;
        },
        writeText: () => {
            return undefined;
        }
    };
    const locator = new AniCliLocator(LOCATIONS, fs, 'linux');
    const calls = { fetched: [] as string[], written: [] as Array<[string, string]>, replaced: [] as Array<[string, string]>, removed: [] as string[], directories: [] as string[], checked: [] as string[] };
    const deps: AniCliUpdaterDependencies = {
        fetchText: async (url) => {
            calls.fetched.push(url);
            if (options.fetchFails) {
                throw new Error('getaddrinfo ENOTFOUND api.github.com');
            }
            if (url === COMMIT_API_URL) {
                return JSON.stringify({ sha: options.commit ?? SHA });
            }
            return options.latest ?? script('5.2.0');
        },
        checkSyntax: async (path) => {
            calls.checked.push(path);
            return options.syntaxOk ?? true;
        },
        readText: (path) => {
            return texts.get(path) ?? null;
        },
        writeFile: (path, content) => {
            calls.written.push([path, content]);
        },
        replaceFile: (from, to) => {
            calls.replaced.push([from, to]);
        },
        removeFile: (path) => {
            calls.removed.push(path);
        },
        makeDirectory: (path) => {
            calls.directories.push(path);
        }
    };
    return { locator, deps, calls };
}

describe('updateAniCli', () => {
    it('installs the latest script in the user data folder, after checking it', async () => {
        const { locator, deps, calls } = setup();
        expect(await updateAniCli(locator, '', deps)).toEqual({ ok: true, output: 'Updated ani-cli 5.1.4 → 5.2.0.' });

        expect(calls.fetched).toEqual([COMMIT_API_URL, `${RAW_SCRIPT_URL}/${SHA}/ani-cli`]);
        expect(calls.directories).toEqual(['/data/bin']);
        expect(calls.written).toEqual([['/data/bin/ani-cli.tmp', script('5.2.0')]]);
        expect(calls.checked).toEqual(['/data/bin/ani-cli.tmp']);
        expect(calls.replaced).toEqual([['/data/bin/ani-cli.tmp', '/data/bin/ani-cli']]);
        expect(calls.removed).toEqual([]);
    });

    it('says the version it came from is unknown when the installed script does not say it', async () => {
        const { locator, deps } = setup({ installed: '#!/bin/sh\necho no version' });
        expect((await updateAniCli(locator, '', deps)).output).toBe('Updated ani-cli unknown → 5.2.0.');
    });

    it('also installs when nothing is installed yet', async () => {
        const { locator, deps, calls } = setup({ installed: null });
        expect(await updateAniCli(locator, '', deps)).toEqual({ ok: true, output: 'Updated ani-cli unknown → 5.2.0.' });
        expect(calls.replaced).toHaveLength(1);
    });

    it('installs a newer script of the same version (commits without a new number)', async () => {
        const { locator, deps, calls } = setup({ latest: script('5.1.4', '# fixed something') });
        expect(await updateAniCli(locator, '', deps)).toEqual({ ok: true, output: 'Updated ani-cli 5.1.4 → 5.1.4.' });
        expect(calls.replaced).toHaveLength(1);
    });

    it('does nothing when the script is the same', async () => {
        const { locator, deps, calls } = setup({ latest: script('5.1.4') });
        expect(await updateAniCli(locator, '', deps)).toEqual({ ok: true, output: 'ani-cli is already up to date (5.1.4).' });
        expect(calls.written).toEqual([]);
        expect(calls.checked).toEqual([]);
    });

    it('does not go back to an older version', async () => {
        const { locator, deps, calls } = setup({ latest: script('5.0.9') });
        expect(await updateAniCli(locator, '', deps)).toEqual({ ok: true, output: 'ani-cli is already up to date (5.1.4).' });
        expect(calls.written).toEqual([]);
    });

    it('leaves a script the user chose alone, without going to the network', async () => {
        const { locator, deps, calls } = setup();
        expect(await updateAniCli(locator, '/opt/ani-cli', deps)).toEqual({ ok: false, output: 'You chose your own ani-cli in the settings, so the app does not update it.' });
        expect(calls.fetched).toEqual([]);
    });

    it.each([[JSON.stringify({}), 'no sha'], [JSON.stringify({ sha: 'main' }), 'not a commit'], [JSON.stringify({ sha: 42 }), 'not text'], [JSON.stringify({ sha: 'A'.repeat(40) }), 'upper case']])(
        'refuses an answer without a commit address (%s: %s)',
        async (answer) => {
            const { locator, deps, calls } = setup();
            vi.spyOn(deps, 'fetchText').mockResolvedValueOnce(answer);
            expect(await updateAniCli(locator, '', deps)).toEqual({ ok: false, output: 'Could not find the latest ani-cli.' });
            expect(calls.written).toEqual([]);
        }
    );

    it.each([
        ['an empty answer', ''],
        ['something that is not a shell script', '<html>rate limited</html>'],
        ['a script without a version', '#!/bin/sh\necho hi'],
        ['a script that is far too big', `${script('9.9.9')}${'x'.repeat(MAX_SCRIPT_BYTES)}`]
    ])('discards %s', async (_name, latest) => {
        const { locator, deps, calls } = setup({ latest });
        expect(await updateAniCli(locator, '', deps)).toEqual({ ok: false, output: 'The downloaded ani-cli did not pass the checks. The download was discarded.' });
        expect(calls.written).toEqual([]);
        expect(calls.replaced).toEqual([]);
    });

    it('discards a script the shell does not accept and removes what it wrote', async () => {
        const { locator, deps, calls } = setup({ syntaxOk: false });
        expect(await updateAniCli(locator, '', deps)).toEqual({ ok: false, output: 'The downloaded ani-cli did not pass the checks. The download was discarded.' });
        expect(calls.written).toHaveLength(1);
        expect(calls.removed).toEqual(['/data/bin/ani-cli.tmp']);
        expect(calls.replaced).toEqual([]);
    });

    it('reports a failure to reach the network', async () => {
        const { locator, deps, calls } = setup({ fetchFails: true });
        expect(await updateAniCli(locator, '', deps)).toEqual({ ok: false, output: 'getaddrinfo ENOTFOUND api.github.com' });
        expect(calls.written).toEqual([]);
    });

    it('reports a failure that is not an Error', async () => {
        const { locator, deps } = setup();
        vi.spyOn(deps, 'fetchText').mockRejectedValueOnce('boom');
        expect(await updateAniCli(locator, '', deps)).toEqual({ ok: false, output: 'Update failed.' });
    });

    it('reports an answer that is not JSON', async () => {
        const { locator, deps } = setup();
        vi.spyOn(deps, 'fetchText').mockResolvedValueOnce('<html>');
        expect((await updateAniCli(locator, '', deps)).ok).toBe(false);
    });

    it('answers in the language of the app', async () => {
        applyLanguage('pt', 'pt-BR');
        const { locator, deps } = setup({ latest: script('5.1.4') });
        expect(await updateAniCli(locator, '', deps)).toEqual({ ok: true, output: 'O ani-cli já está atualizado (5.1.4).' });
    });
});

describe('createDefaultUpdaterDependencies', () => {
    it('reads, writes and replaces real files, writing the script so it can run', () => {
        const root = makeTempDir();
        const deps = createDefaultUpdaterDependencies('/bin/sh', (path) => {
            return existsSync(path) ? readFileSync(path, 'utf-8') : null;
        });
        deps.makeDirectory(join(root, 'bin', 'nested'));
        deps.writeFile(join(root, 'bin', 'nested', 'a.tmp'), '#!/bin/sh\n');
        if (process.platform !== 'win32') {
            // Windows has no execute permission to check.
            expect(statSync(join(root, 'bin', 'nested', 'a.tmp')).mode & 0o111).not.toBe(0);
        }

        deps.replaceFile(join(root, 'bin', 'nested', 'a.tmp'), join(root, 'bin', 'nested', 'a'));
        expect(deps.readText(join(root, 'bin', 'nested', 'a'))).toBe('#!/bin/sh\n');
        expect(deps.readText(join(root, 'missing'))).toBeNull();

        deps.removeFile(join(root, 'bin', 'nested', 'a'));
        deps.removeFile(join(root, 'bin', 'nested', 'a'));
        expect(existsSync(join(root, 'bin', 'nested', 'a'))).toBe(false);
    });

    it.skipIf(!existsSync(BUSYBOX))('checks the syntax with the shell that ships with the app, without running the script', async () => {
        const root = makeTempDir();
        const deps = createDefaultUpdaterDependencies(BUSYBOX, () => {
            return null;
        });
        writeFileSync(join(root, 'good.sh'), 'echo hello > /nonexistent/never-run\n');
        writeFileSync(join(root, 'bad.sh'), 'if then fi (\n');
        expect(await deps.checkSyntax(join(root, 'good.sh'))).toBe(true);
        expect(await deps.checkSyntax(join(root, 'bad.sh'))).toBe(false);
    });

    it('fails the check when the shell cannot be started', async () => {
        const deps = createDefaultUpdaterDependencies('/nonexistent/sh', () => {
            return null;
        });
        expect(await deps.checkSyntax('/tmp/x')).toBe(false);
    });
});

describe('defaultFetchText', () => {
    it('reads the text of an answer and tells who is asking', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('hello'));
        expect(await defaultFetchText('https://example.com/x')).toBe('hello');
        expect(fetchMock).toHaveBeenCalledWith('https://example.com/x', { headers: { 'User-Agent': 'pullwave' }, redirect: 'follow' });
    });

    it('fails with the status of a refused request', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('no', { status: 403 }));
        await expect(defaultFetchText('https://example.com/x')).rejects.toThrow('Request failed (403) for https://example.com/x');
    });
});
