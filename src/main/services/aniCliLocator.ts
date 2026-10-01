import { existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AniCliInfo, AnimeAudio } from '@shared/anime';
import type { BinarySource } from '@shared/types';
import { patchAniCli } from './aniPatches';
import { compareVersions, parseAniCliVersion } from './aniVersion';
import { SUBTITLE_LABELS_VARIABLE } from './aniSubtitles';
import type { ResolvedBinary } from './binaryResolver';

export const ANI_CLI_COMMAND = 'ani-cli';
export const ANI_MENU_COMMAND = 'pullwave-menu';
export const ANI_PLAYER_COMMAND = 'pullwave-noplayer';
// The scripts that stand in for what ani-cli expects to find on a desktop: a menu, a player and a terminal.
export const ANI_SCRIPT_COMMANDS = [ANI_MENU_COMMAND, ANI_PLAYER_COMMAND, 'tput'];
// What ani-cli runs besides curl, yt-dlp and ffmpeg. busybox answers to each of these names.
export const BUSYBOX_APPLETS = [
    'sed',
    'grep',
    'cut',
    'head',
    'tail',
    'tr',
    'wc',
    'sort',
    'od',
    'base64',
    'printf',
    'mkdir',
    'rm',
    'cat',
    'date',
    'nl',
    'cp',
    'mv',
    'uname',
    'sleep'
];

export interface AniLocations {
    // resources/bin: yt-dlp, ffmpeg, deno and the ani folder with ani-cli, busybox and curl.
    bundledDir: string;
    // resources/ani-scripts: the stand-ins for the menu, the player and tput.
    scriptsDir: string;
    // userData/bin: where an updated ani-cli is saved.
    userBinDir: string;
    // userData/anime: the folder for everything ani-cli writes (history) and for the links to the tools.
    dataDir: string;
}

export interface AniTools {
    ytdlp: ResolvedBinary;
    ffmpeg: ResolvedBinary;
}

export interface AniToolsFs {
    exists: (path: string) => boolean;
    mkdir: (path: string) => void;
    symlink: (target: string, path: string) => void;
    readlink: (path: string) => string | null;
    remove: (path: string) => void;
    // The text of a file, or null when it cannot be read.
    readText: (path: string) => string | null;
    writeText: (path: string, content: string) => void;
}

export interface AniEnvOptions {
    audio: AnimeAudio;
    downloadDir: string;
    // The languages of the subtitles to try, in order (see aniSubtitles.ts).
    subtitleLabels: readonly string[];
    // What ani-cli runs to "play": nothing by default; "debug" makes it print the address of the episode instead.
    player?: string;
}

// The text of a file, or null when it cannot be read.
export function readTextFile(path: string): string | null {
    try {
        return readFileSync(path, 'utf-8');
    } catch {
        return null;
    }
}

const defaultFs: AniToolsFs = {
    exists: existsSync,
    mkdir: (path) => {
        mkdirSync(path, { recursive: true });
    },
    symlink: (target, path) => {
        symlinkSync(target, path);
    },
    readlink: (path) => {
        try {
            return readlinkSync(path);
        } catch {
            return null;
        }
    },
    remove: (path) => {
        rmSync(path, { force: true });
    },
    readText: readTextFile,
    writeText: (path, content) => {
        writeFileSync(path, content);
    }
};

export class AniCliLocator {
    constructor(
        private readonly locations: AniLocations,
        private readonly fs: AniToolsFs = defaultFs
    ) {}

    get toolsDir(): string {
        return join(this.locations.dataDir, 'tools');
    }

    get historyDir(): string {
        return join(this.locations.dataDir, 'history');
    }

    get userBinDirectory(): string {
        return this.locations.userBinDir;
    }

    get userAniCliPath(): string {
        return join(this.locations.userBinDir, ANI_CLI_COMMAND);
    }

    get busyboxPath(): string {
        return join(this.locations.bundledDir, 'ani', 'busybox');
    }

    get curlPath(): string {
        return join(this.locations.bundledDir, 'ani', 'curl');
    }

    // ani-cli never comes from the system: it has to match the tools that ship with the app. A copy the app updated is used
    // unless the one that ships with it is newer (the app itself was updated since).
    script(customPath: string): ResolvedBinary | null {
        if (customPath.length > 0) {
            return { path: customPath, source: 'custom' };
        }
        const bundledPath = join(this.locations.bundledDir, 'ani', ANI_CLI_COMMAND);
        const hasUpdated = this.fs.exists(this.userAniCliPath);
        const hasBundled = this.fs.exists(bundledPath);
        if (hasUpdated && (!hasBundled || !this.isNewer(bundledPath, this.userAniCliPath))) {
            return { path: this.userAniCliPath, source: 'updated' };
        }
        return hasBundled ? { path: bundledPath, source: 'bundled' } : null;
    }

    // Whether the script at `candidate` says a newer version than the one at `other` (false when either says nothing).
    private isNewer(candidate: string, other: string): boolean {
        const newer = this.versionOf(candidate);
        const older = this.versionOf(other);
        return newer !== null && older !== null && compareVersions(newer, older) > 0;
    }

    private versionOf(path: string): string | null {
        const source = this.fs.readText(path);
        return source === null ? null : parseAniCliVersion(source);
    }

    // What is shown about ani-cli: which copy is used and its version.
    info(customPath: string): AniCliInfo {
        const script = this.script(customPath);
        if (script === null) {
            return { found: false, path: join(this.locations.bundledDir, 'ani', ANI_CLI_COMMAND), version: null, source: 'bundled' };
        }
        const version = this.versionOf(script.path);
        return { found: this.fs.exists(script.path), path: script.path, version, source: script.source as AniCliInfo['source'] };
    }

    // The names every tool answers to inside the isolated PATH, and what each one points at.
    private toolLinks(tools: AniTools): Array<{ name: string; target: string }> {
        const links = [
            ...BUSYBOX_APPLETS.map((name) => {
                return { name, target: this.busyboxPath };
            }),
            ...ANI_SCRIPT_COMMANDS.map((name) => {
                return { name, target: join(this.locations.scriptsDir, name) };
            }),
            { name: 'curl', target: this.curlPath }
        ];
        const optional: Array<{ name: string; binary: ResolvedBinary }> = [
            { name: 'yt-dlp', binary: tools.ytdlp },
            { name: 'ffmpeg', binary: tools.ffmpeg }
        ];
        optional.forEach(({ name, binary }) => {
            if (isLinkable(binary.source)) {
                links.push({ name, target: binary.path });
            }
        });
        return links;
    }

    // Symlinks cannot be shipped reliably inside the packages, so they are made here, once, and kept up to date.
    prepareTools(tools: AniTools): void {
        this.fs.mkdir(this.toolsDir);
        this.fs.mkdir(this.historyDir);
        this.toolLinks(tools).forEach(({ name, target }) => {
            const linkPath = join(this.toolsDir, name);
            if (this.fs.readlink(linkPath) === target) {
                return;
            }
            this.fs.remove(linkPath);
            this.fs.symlink(target, linkPath);
        });
    }

    get patchedScriptPath(): string {
        return join(this.locations.dataDir, 'ani-cli.patched');
    }

    // The script with Pullwave's changes (see aniPatches.ts), saved next to the tools. A script the user chose is never
    // changed, and one this cannot patch is used as it is.
    withPatches(script: ResolvedBinary): ResolvedBinary {
        if (script.source === 'custom') {
            return script;
        }
        const source = this.fs.readText(script.path);
        const patched = source === null ? null : patchAniCli(source);
        if (patched === null) {
            return script;
        }
        if (this.fs.readText(this.patchedScriptPath) !== patched) {
            this.fs.mkdir(this.locations.dataDir);
            this.fs.writeText(this.patchedScriptPath, patched);
        }
        return { path: this.patchedScriptPath, source: script.source };
    }

    // busybox runs the script itself, so the system's /bin/sh is not involved.
    command(script: ResolvedBinary): { binary: string; args: string[] } {
        return { binary: this.busyboxPath, args: ['sh', script.path] };
    }

    // The PATH holds the links and the bundled folder only: nothing installed on the system can leak in.
    env(options: AniEnvOptions, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
        const env: NodeJS.ProcessEnv = {
            PATH: `${this.toolsDir}:${this.locations.bundledDir}`,
            ANI_CLI_MENU: ANI_MENU_COMMAND,
            ANI_CLI_PLAYER: options.player ?? ANI_PLAYER_COMMAND,
            ANI_CLI_LOG: '0',
            ANI_CLI_MODE: options.audio,
            ANI_CLI_HIST_DIR: this.historyDir,
            ANI_CLI_DOWNLOAD_DIR: options.downloadDir,
            [SUBTITLE_LABELS_VARIABLE]: options.subtitleLabels.join('|')
        };
        // yt-dlp keeps its cache under HOME and the locale decides how titles are written.
        (['HOME', 'LANG', 'LC_ALL', 'TMPDIR'] as const).forEach((key) => {
            const value = baseEnv[key];
            if (value !== undefined) {
                env[key] = value;
            }
        });
        return env;
    }
}

function isLinkable(source: BinarySource): boolean {
    return source !== 'system';
}
