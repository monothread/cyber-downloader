import {
    AniCliLocator,
    ANI_CLI_COMMAND,
    ANI_MENU_COMMAND,
    ANI_PLAYER_COMMAND,
    ANI_RUNNER_SCRIPT,
    WINDOWS_SYSTEM_VARIABLES,
    BUSYBOX_APPLETS,
    type AniLocations,
    type AniTools,
    type AniToolsFs
} from '@main/services/aniCliLocator';
import { cleanTempDirs, makeTempDir } from '../../helpers/tempDir';
import { existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function newLinuxLocator(locations: AniLocations, fs?: AniToolsFs): AniCliLocator {
    return new AniCliLocator(locations, fs, 'linux');
}

const LOCATIONS: AniLocations = {
    bundledDir: '/app/resources/bin',
    scriptsDir: '/app/resources/ani-scripts',
    userBinDir: '/data/bin',
    dataDir: '/data/anime'
};

const TOOLS: AniTools = {
    ytdlp: { path: '/app/resources/bin/yt-dlp', source: 'bundled' },
    ffmpeg: { path: '/app/resources/bin/ffmpeg', source: 'bundled' }
};

interface FakeFs {
    fs: AniToolsFs;
    links: Map<string, string>;
    directories: string[];
    removed: string[];
    texts: Map<string, string>;
    writes: Array<[string, string]>;
}

function makeFs(existing: string[] = [], links: Record<string, string> = {}, texts: Record<string, string> = {}): FakeFs {
    const textMap = new Map<string, string>(Object.entries(texts));
    const writes: Array<[string, string]> = [];
    const linkMap = new Map<string, string>(Object.entries(links));
    const directories: string[] = [];
    const removed: string[] = [];
    const fs: AniToolsFs = {
        exists: (path) => {
            return existing.includes(path);
        },
        mkdir: (path) => {
            directories.push(path);
        },
        symlink: (target, path) => {
            linkMap.set(path, target);
        },
        readlink: (path) => {
            return linkMap.get(path) ?? null;
        },
        remove: (path) => {
            removed.push(path);
            linkMap.delete(path);
        },
        readText: (path) => {
            return textMap.get(path) ?? null;
        },
        writeText: (path, content) => {
            writes.push([path, content]);
            textMap.set(path, content);
        }
    };
    return { fs, links: linkMap, directories, removed, texts: textMap, writes };
}

afterEach(() => {
    cleanTempDirs();
});

describe('AniCliLocator paths', () => {
    const locator = newLinuxLocator(LOCATIONS, makeFs().fs);

    it('derives every path from the locations', () => {
        expect(locator.toolsDir).toBe('/data/anime/tools');
        expect(locator.historyDir).toBe('/data/anime/history');
        expect(locator.userAniCliPath).toBe('/data/bin/ani-cli');
        expect(locator.userBinDirectory).toBe('/data/bin');
        expect(locator.busyboxPath).toBe('/app/resources/bin/ani/busybox');
        expect(locator.curlPath).toBe('/app/resources/bin/ani/curl');
    });
});

describe('AniCliLocator.script', () => {
    it('prefers the custom path from the settings', () => {
        const locator = newLinuxLocator(LOCATIONS, makeFs(['/data/bin/ani-cli', '/app/resources/bin/ani/ani-cli']).fs);
        expect(locator.script('/opt/ani-cli')).toEqual({ path: '/opt/ani-cli', source: 'custom' });
    });

    it('uses the updated copy over the bundled one', () => {
        const locator = newLinuxLocator(LOCATIONS, makeFs(['/data/bin/ani-cli', '/app/resources/bin/ani/ani-cli']).fs);
        expect(locator.script('')).toEqual({ path: '/data/bin/ani-cli', source: 'updated' });
    });

    it('uses the updated copy when it is newer, the same or says nothing', () => {
        const paths = ['/data/bin/ani-cli', '/app/resources/bin/ani/ani-cli'];
        const withVersions = (updated: string | undefined, bundled: string | undefined) => {
            const texts: Record<string, string> = {};
            if (updated !== undefined) {
                texts['/data/bin/ani-cli'] = `version_number="${updated}"`;
            }
            if (bundled !== undefined) {
                texts['/app/resources/bin/ani/ani-cli'] = `version_number="${bundled}"`;
            }
            return newLinuxLocator(LOCATIONS, makeFs(paths, {}, texts).fs).script('');
        };
        expect(withVersions('5.2.0', '5.1.4')?.source).toBe('updated');
        expect(withVersions('5.1.4', '5.1.4')?.source).toBe('updated');
        expect(withVersions(undefined, '5.1.4')?.source).toBe('updated');
        expect(withVersions('5.2.0', undefined)?.source).toBe('updated');
    });

    it('uses the bundled copy when it is newer than the updated one (the app was updated since)', () => {
        const texts = { '/data/bin/ani-cli': 'version_number="5.1.4"', '/app/resources/bin/ani/ani-cli': 'version_number="5.2.0"' };
        const locator = newLinuxLocator(LOCATIONS, makeFs(['/data/bin/ani-cli', '/app/resources/bin/ani/ani-cli'], {}, texts).fs);
        expect(locator.script('')).toEqual({ path: '/app/resources/bin/ani/ani-cli', source: 'bundled' });
    });

    it('uses the bundled copy when there is no updated one', () => {
        const locator = newLinuxLocator(LOCATIONS, makeFs(['/app/resources/bin/ani/ani-cli']).fs);
        expect(locator.script('')).toEqual({ path: '/app/resources/bin/ani/ani-cli', source: 'bundled' });
    });

    it('uses the updated copy when it is the only one', () => {
        expect(newLinuxLocator(LOCATIONS, makeFs(['/data/bin/ani-cli']).fs).script('')).toEqual({ path: '/data/bin/ani-cli', source: 'updated' });
    });

    it('never falls back to a copy installed on the system', () => {
        expect(newLinuxLocator(LOCATIONS, makeFs().fs).script('')).toBeNull();
    });
});

describe('AniCliLocator.info', () => {
    it('tells which copy is used and its version', () => {
        const texts = { '/app/resources/bin/ani/ani-cli': '#!/bin/sh\nversion_number="5.1.4"\n' };
        const locator = newLinuxLocator(LOCATIONS, makeFs(['/app/resources/bin/ani/ani-cli'], {}, texts).fs);
        expect(locator.info('')).toEqual({ found: true, path: '/app/resources/bin/ani/ani-cli', version: '5.1.4', source: 'bundled' });
    });

    it('tells the updated copy', () => {
        const texts = { '/data/bin/ani-cli': 'version_number="5.2.0"' };
        expect(newLinuxLocator(LOCATIONS, makeFs(['/data/bin/ani-cli'], {}, texts).fs).info('')).toEqual({ found: true, path: '/data/bin/ani-cli', version: '5.2.0', source: 'updated' });
    });

    it('has no version when the script says none or cannot be read', () => {
        expect(newLinuxLocator(LOCATIONS, makeFs(['/app/resources/bin/ani/ani-cli'], {}, { '/app/resources/bin/ani/ani-cli': 'no version here' }).fs).info('').version).toBeNull();
        expect(newLinuxLocator(LOCATIONS, makeFs(['/app/resources/bin/ani/ani-cli']).fs).info('')).toMatchObject({ found: true, version: null });
    });

    it('describes the script the user chose', () => {
        const locator = newLinuxLocator(LOCATIONS, makeFs(['/opt/ani-cli'], {}, { '/opt/ani-cli': 'version_number="1.2.3"' }).fs);
        expect(locator.info('/opt/ani-cli')).toEqual({ found: true, path: '/opt/ani-cli', version: '1.2.3', source: 'custom' });
        expect(locator.info('/opt/missing')).toEqual({ found: false, path: '/opt/missing', version: null, source: 'custom' });
    });

    it('says it was not found, pointing at where the bundled one should be', () => {
        expect(newLinuxLocator(LOCATIONS, makeFs().fs).info('')).toEqual({ found: false, path: '/app/resources/bin/ani/ani-cli', version: null, source: 'bundled' });
    });
});

describe('AniCliLocator.prepareTools', () => {
    it('creates the folders and one link per tool', () => {
        const { fs, links, directories } = makeFs();
        newLinuxLocator(LOCATIONS, fs).prepareTools(TOOLS);

        expect(directories).toEqual(['/data/anime/tools', '/data/anime/history']);
        const expected: Record<string, string> = {};
        BUSYBOX_APPLETS.forEach((name) => {
            expected[`/data/anime/tools/${name}`] = '/app/resources/bin/ani/busybox';
        });
        expected['/data/anime/tools/curl'] = '/app/resources/bin/ani/curl';
        expected['/data/anime/tools/yt-dlp'] = '/app/resources/bin/yt-dlp';
        expected['/data/anime/tools/ffmpeg'] = '/app/resources/bin/ffmpeg';
        expect(Object.fromEntries(links)).toEqual(expected);
    });

    it('links the yt-dlp and ffmpeg that were chosen, whatever their source', () => {
        const { fs, links } = makeFs();
        newLinuxLocator(LOCATIONS, fs).prepareTools({
            ytdlp: { path: '/data/bin/yt-dlp', source: 'updated' },
            ffmpeg: { path: '/opt/ffmpeg', source: 'custom' }
        });
        expect(links.get('/data/anime/tools/yt-dlp')).toBe('/data/bin/yt-dlp');
        expect(links.get('/data/anime/tools/ffmpeg')).toBe('/opt/ffmpeg');
    });

    it('does not link a tool that only exists on the system', () => {
        const { fs, links } = makeFs();
        newLinuxLocator(LOCATIONS, fs).prepareTools({
            ytdlp: { path: 'yt-dlp', source: 'system' },
            ffmpeg: { path: 'ffmpeg', source: 'system' }
        });
        expect(links.has('/data/anime/tools/yt-dlp')).toBe(false);
        expect(links.has('/data/anime/tools/ffmpeg')).toBe(false);
        expect(links.has('/data/anime/tools/curl')).toBe(true);
    });

    it('keeps links that already point at the right place', () => {
        const { fs, removed } = makeFs([], { '/data/anime/tools/curl': '/app/resources/bin/ani/curl' });
        newLinuxLocator(LOCATIONS, fs).prepareTools(TOOLS);
        expect(removed).not.toContain('/data/anime/tools/curl');
    });

    it('replaces links that point somewhere else', () => {
        const { fs, links, removed } = makeFs([], { '/data/anime/tools/yt-dlp': '/old/yt-dlp' });
        newLinuxLocator(LOCATIONS, fs).prepareTools(TOOLS);
        expect(removed).toContain('/data/anime/tools/yt-dlp');
        expect(links.get('/data/anime/tools/yt-dlp')).toBe('/app/resources/bin/yt-dlp');
    });

    it('creates real links on the file system and is safe to repeat', () => {
        const root = makeTempDir();
        const locator = new AniCliLocator({ bundledDir: join(root, 'bin'), scriptsDir: join(root, 'scripts'), userBinDir: join(root, 'user'), dataDir: join(root, 'data') });
        mkdirSync(join(root, 'bin'), { recursive: true });
        writeFileSync(join(root, 'bin', 'yt-dlp'), '');
        const tools: AniTools = {
            ytdlp: { path: join(root, 'bin', 'yt-dlp'), source: 'bundled' },
            ffmpeg: { path: 'ffmpeg', source: 'system' }
        };

        locator.prepareTools(tools);
        locator.prepareTools(tools);

        expect(lstatSync(join(root, 'data', 'tools', 'sed')).isSymbolicLink()).toBe(true);
        expect(readlinkSync(join(root, 'data', 'tools', 'sed'))).toBe(join(root, 'bin', 'ani', 'busybox'));
        expect(readlinkSync(join(root, 'data', 'tools', 'yt-dlp'))).toBe(join(root, 'bin', 'yt-dlp'));
        expect(existsSync(join(root, 'data', 'history'))).toBe(true);
    });
});

describe('AniCliLocator.env player', () => {
    const locator = newLinuxLocator(LOCATIONS, makeFs().fs);

    it('plays nothing by default', () => {
        expect(locator.env({ audio: 'sub', downloadDir: '.', subtitleLabels: [] }, {}).ANI_CLI_PLAYER).toBe('pullwave_noplayer');
    });

    it('can ask ani-cli to print the address instead', () => {
        expect(locator.env({ audio: 'sub', downloadDir: '.', subtitleLabels: [], player: 'debug' }, {}).ANI_CLI_PLAYER).toBe('debug');
    });
});

describe('AniCliLocator.env subtitles', () => {
    const locator = newLinuxLocator(LOCATIONS, makeFs().fs);

    it('joins the languages with a bar, in order', () => {
        expect(locator.env({ audio: 'sub', downloadDir: '.', subtitleLabels: ['Spanish'] }, {}).PULLWAVE_SUB_LABELS).toBe('Spanish');
        expect(locator.env({ audio: 'sub', downloadDir: '.', subtitleLabels: ['Spanish', 'English'] }, {}).PULLWAVE_SUB_LABELS).toBe('Spanish|English');
    });

    it('leaves the variable empty when ani-cli should choose', () => {
        expect(locator.env({ audio: 'sub', downloadDir: '.', subtitleLabels: [] }, {}).PULLWAVE_SUB_LABELS).toBe('');
    });
});

describe('AniCliLocator.withPatches', () => {
    const ORIGINAL = [
        '# header',
        'hianime_m3u8() {',
        `    sub_link="$(printf "%s" "$_json" | sed 's|.*"subtitles":\\[||; s|}\\].*||; s|},{|}\\n{|g' | grep -m 1 '"default":true' | sed -nE 's|.*"src":"([^"]*)".*|\\1|p')"`,
        '}'
    ].join('\n');
    const bundled = { path: '/app/resources/bin/ani/ani-cli', source: 'bundled' as const };

    it('saves a patched copy next to the tools and uses it', () => {
        const { fs, writes, directories } = makeFs([], {}, { [bundled.path]: ORIGINAL });
        const result = newLinuxLocator(LOCATIONS, fs).withPatches(bundled);

        expect(result).toEqual({ path: '/data/anime/ani-cli.patched', source: 'bundled' });
        expect(writes).toHaveLength(1);
        expect(writes[0]?.[0]).toBe('/data/anime/ani-cli.patched');
        expect(writes[0]?.[1]).toContain('sub_link="$(pullwave_pick_subtitle "$_json")"');
        expect(directories).toEqual(['/data/anime']);
    });

    it('also patches the debug output of the script', () => {
        const debug = 'x\n        debug) printf "All links:\\n%s\\nSelected link:\\n%s\\nSubtitles:\\n%s\\n" "$links" "$video_link" "$sub_link" ;;';
        const { fs, writes } = makeFs([], {}, { [bundled.path]: debug });
        newLinuxLocator(LOCATIONS, fs).withPatches(bundled);
        expect(writes[0]?.[1]).toContain('Referer:');
    });

    it('keeps the source of the script it patched', () => {
        const updated = { path: '/data/bin/ani-cli', source: 'updated' as const };
        const { fs } = makeFs([], {}, { [updated.path]: ORIGINAL });
        expect(newLinuxLocator(LOCATIONS, fs).withPatches(updated).source).toBe('updated');
    });

    it('does not write the copy again when it is already up to date', () => {
        const first = makeFs([], {}, { [bundled.path]: ORIGINAL });
        const locator = newLinuxLocator(LOCATIONS, first.fs);
        locator.withPatches(bundled);
        locator.withPatches(bundled);
        expect(first.writes).toHaveLength(1);
    });

    it('writes the copy again when it is out of date', () => {
        const { fs, writes } = makeFs([], {}, { [bundled.path]: ORIGINAL, '/data/anime/ani-cli.patched': 'old copy' });
        newLinuxLocator(LOCATIONS, fs).withPatches(bundled);
        expect(writes).toHaveLength(1);
    });

    it('never changes a script the user chose', () => {
        const custom = { path: '/opt/ani-cli', source: 'custom' as const };
        const { fs, writes } = makeFs([], {}, { [custom.path]: ORIGINAL });
        expect(newLinuxLocator(LOCATIONS, fs).withPatches(custom)).toBe(custom);
        expect(writes).toEqual([]);
    });

    it('uses the script as it is when it cannot be read', () => {
        const { fs, writes } = makeFs();
        expect(newLinuxLocator(LOCATIONS, fs).withPatches(bundled)).toBe(bundled);
        expect(writes).toEqual([]);
    });

    it('uses the script as it is when it is a version it cannot patch', () => {
        const { fs, writes } = makeFs([], {}, { [bundled.path]: 'a different script' });
        expect(newLinuxLocator(LOCATIONS, fs).withPatches(bundled)).toBe(bundled);
        expect(writes).toEqual([]);
    });

    it('reads and writes real files', () => {
        const root = makeTempDir();
        const script = join(root, 'ani-cli');
        writeFileSync(script, ORIGINAL);
        const locator = new AniCliLocator({ bundledDir: join(root, 'bin'), scriptsDir: join(root, 's'), userBinDir: join(root, 'u'), dataDir: join(root, 'data') });

        const result = locator.withPatches({ path: script, source: 'bundled' });

        expect(result.path).toBe(join(root, 'data', 'ani-cli.patched'));
        expect(readFileSync(result.path, 'utf-8')).toContain('pullwave_pick_subtitle() {');
        expect(locator.withPatches({ path: join(root, 'missing'), source: 'bundled' }).path).toBe(join(root, 'missing'));
    });
});

describe('AniCliLocator.command', () => {
    it('runs the script with the busybox that ships with the app', () => {
        const locator = newLinuxLocator(LOCATIONS, makeFs().fs);
        expect(locator.command({ path: '/app/resources/bin/ani/ani-cli', source: 'bundled' })).toEqual({
            binary: '/app/resources/bin/ani/busybox',
            args: ['sh', '/app/resources/ani-scripts/pullwave-run.sh', '/app/resources/bin/ani/ani-cli']
        });
    });
});

describe('AniCliLocator.env', () => {
    const locator = newLinuxLocator(LOCATIONS, makeFs().fs);

    it('builds an isolated environment', () => {
        expect(locator.env({ audio: 'dub', downloadDir: '/home/me/Anime', subtitleLabels: ['Portuguese', 'English'] }, { PATH: '/usr/bin', HOME: '/home/me', LANG: 'pt_BR.UTF-8', SECRET: 'x' })).toEqual({
            PATH: '/data/anime/tools:/app/resources/bin',
            ANI_CLI_MENU: ANI_MENU_COMMAND,
            ANI_CLI_PLAYER: ANI_PLAYER_COMMAND,
            ANI_CLI_LOG: '0',
            ANI_CLI_MODE: 'dub',
            ANI_CLI_HIST_DIR: '/data/anime/history',
            ANI_CLI_DOWNLOAD_DIR: '/home/me/Anime',
            PULLWAVE_SUB_LABELS: 'Portuguese|English',
            HOME: '/home/me',
            LANG: 'pt_BR.UTF-8'
        });
    });

    it('passes on only the variables ani-cli and yt-dlp need', () => {
        const env = locator.env({ audio: 'sub', downloadDir: '.', subtitleLabels: [] }, { HOME: '/h', LC_ALL: 'C', TMPDIR: '/t', PATH: '/usr/bin', DISPLAY: ':0' });
        expect(env.HOME).toBe('/h');
        expect(env.LC_ALL).toBe('C');
        expect(env.TMPDIR).toBe('/t');
        expect(env.LANG).toBeUndefined();
        expect(env.DISPLAY).toBeUndefined();
        expect(env.PATH).toBe('/data/anime/tools:/app/resources/bin');
    });

    it('sets the audio mode', () => {
        expect(locator.env({ audio: 'sub', downloadDir: '.', subtitleLabels: [] }, {}).ANI_CLI_MODE).toBe('sub');
    });
});

describe('constants', () => {
    it('names the tools ani-cli looks for', () => {
        expect(ANI_CLI_COMMAND).toBe('ani-cli');
        expect(ANI_MENU_COMMAND).toBe('pullwave_menu');
        expect(ANI_PLAYER_COMMAND).toBe('pullwave_noplayer');
        expect(ANI_RUNNER_SCRIPT).toBe('pullwave-run.sh');
    });

    it('lists what a Windows program needs from the system', () => {
        expect(WINDOWS_SYSTEM_VARIABLES).toEqual(['SystemRoot', 'windir', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'PATHEXT', 'COMSPEC', 'HOMEDRIVE', 'HOMEPATH']);
    });
});
