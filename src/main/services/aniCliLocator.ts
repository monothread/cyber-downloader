import { existsSync, mkdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import type { AniCliInfo, AnimeAudio } from '@shared/anime';
import type { BinarySource } from '@shared/types';
import { patchAniCli } from './aniPatches';
import { compareVersions, parseAniCliVersion } from './aniVersion';
import { SUBTITLE_LABELS_VARIABLE } from './aniSubtitles';
import { executableName, type ResolvedBinary } from './binaryResolver';

export const ANI_CLI_COMMAND = 'ani-cli';
// The stand-ins for what ani-cli expects to find on a desktop (a menu and a player) are functions defined by the script that
// runs ani-cli (see resources/ani-scripts/pullwave-run.sh), so nothing has to be on PATH for them.
export const ANI_MENU_COMMAND = 'pullwave_menu';
export const ANI_PLAYER_COMMAND = 'pullwave_noplayer';
export const ANI_RUNNER_SCRIPT = 'pullwave-run.sh';
// What Windows programs need from the system to work: without these curl cannot reach the network and yt-dlp cannot find
// its cache. Nothing else of the environment of the app is passed on.
export const WINDOWS_SYSTEM_VARIABLES = [
    'SystemRoot',
    'windir',
    'TEMP',
    'TMP',
    'USERPROFILE',
    'APPDATA',
    'LOCALAPPDATA',
    'ProgramData',
    'PATHEXT',
    'COMSPEC',
    'HOMEDRIVE',
    'HOMEPATH'
];
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
    // resources/ani-scripts: the script that runs ani-cli with its stand-ins.
    scriptsDir: string;
    // userData/bin: where an updated ani-cli is saved.
    userBinDir: string;
    // userData/anime: the folder for everything ani-cli writes (history) and, on Linux, for the links to the tools.
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
    // Which yt-dlp and ffmpeg ani-cli finds. On Windows their folders go on Path (there are no links to make there).
    tools?: AniTools;
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
    // The paths follow the rules of the system the script runs on, whichever one this code is running on (the tests rely on it).
    private readonly path: typeof posix;

    constructor(
        private readonly locations: AniLocations,
        private readonly fs: AniToolsFs = defaultFs,
        private readonly platform: NodeJS.Platform = process.platform
    ) {
        this.path = platform === 'win32' ? win32 : posix;
    }

    // BusyBox for Windows (and the shell it runs) is happier with forward slashes.
    private forScript(path: string): string {
        return this.platform === 'win32' ? path.replace(/\\/g, '/') : path;
    }

    private get bundledAniDir(): string {
        return this.path.join(this.locations.bundledDir, 'ani');
    }

    get toolsDir(): string {
        return this.path.join(this.locations.dataDir, 'tools');
    }

    get historyDir(): string {
        return this.path.join(this.locations.dataDir, 'history');
    }

    get runnerPath(): string {
        return this.path.join(this.locations.scriptsDir, ANI_RUNNER_SCRIPT);
    }

    get userBinDirectory(): string {
        return this.locations.userBinDir;
    }

    get userAniCliPath(): string {
        return this.path.join(this.locations.userBinDir, ANI_CLI_COMMAND);
    }

    get busyboxPath(): string {
        return this.path.join(this.bundledAniDir, executableName('busybox', this.platform));
    }

    get curlPath(): string {
        return this.path.join(this.bundledAniDir, executableName('curl', this.platform));
    }

    // ani-cli never comes from the system: it has to match the tools that ship with the app. A copy the app updated is used
    // unless the one that ships with it is newer (the app itself was updated since).
    script(customPath: string): ResolvedBinary | null {
        if (customPath.length > 0) {
            return { path: customPath, source: 'custom' };
        }
        const bundledPath = this.path.join(this.bundledAniDir, ANI_CLI_COMMAND);
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
            return { found: false, path: this.path.join(this.bundledAniDir, ANI_CLI_COMMAND), version: null, source: 'bundled' };
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

    // Symlinks cannot be shipped reliably inside the packages, so they are made here, once, and kept up to date. Windows has
    // none: BusyBox for Windows runs its applets itself and the rest is found through Path (see `env`).
    prepareTools(tools: AniTools): void {
        if (this.platform === 'win32') {
            this.fs.mkdir(this.historyDir);
            return;
        }
        this.fs.mkdir(this.toolsDir);
        this.fs.mkdir(this.historyDir);
        this.toolLinks(tools).forEach(({ name, target }) => {
            const linkPath = this.path.join(this.toolsDir, name);
            if (this.fs.readlink(linkPath) === target) {
                return;
            }
            this.fs.remove(linkPath);
            this.fs.symlink(target, linkPath);
        });
    }

    get patchedScriptPath(): string {
        return this.path.join(this.locations.dataDir, 'ani-cli.patched');
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

    // busybox runs the script that wraps ani-cli (and so ani-cli itself), so the shell of the system is not involved.
    command(script: ResolvedBinary): { binary: string; args: string[] } {
        return { binary: this.busyboxPath, args: ['sh', this.forScript(this.runnerPath), this.forScript(script.path)] };
    }

    // Where ani-cli finds its tools. Only what ships with the app (and the yt-dlp and ffmpeg chosen) is on it: nothing installed on
    // the system can leak in.
    private searchPath(options: AniEnvOptions): string {
        if (this.platform !== 'win32') {
            return `${this.toolsDir}:${this.locations.bundledDir}`;
        }
        const chosen = options.tools ? [options.tools.ytdlp, options.tools.ffmpeg] : [];
        const folders = [
            ...chosen
                .filter((binary) => {
                    return binary.source !== 'system';
                })
                .map((binary) => {
                    return this.path.dirname(binary.path);
                }),
            this.locations.bundledDir,
            this.bundledAniDir
        ];
        return [...new Set(folders)].join(this.path.delimiter);
    }

    env(options: AniEnvOptions, baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
        const env: NodeJS.ProcessEnv = {
            // Windows names the variable "Path"; a second key spelled "PATH" would be a different entry for Node but not for Windows.
            [this.platform === 'win32' ? 'Path' : 'PATH']: this.searchPath(options),
            ANI_CLI_MENU: ANI_MENU_COMMAND,
            ANI_CLI_PLAYER: options.player ?? ANI_PLAYER_COMMAND,
            ANI_CLI_LOG: '0',
            ANI_CLI_MODE: options.audio,
            ANI_CLI_HIST_DIR: this.forScript(this.historyDir),
            ANI_CLI_DOWNLOAD_DIR: this.forScript(options.downloadDir),
            [SUBTITLE_LABELS_VARIABLE]: options.subtitleLabels.join('|')
        };
        // yt-dlp keeps its cache under HOME (the user profile on Windows) and the locale decides how titles are written.
        const passed = this.platform === 'win32' ? [...WINDOWS_SYSTEM_VARIABLES, 'HOME', 'LANG', 'LC_ALL'] : ['HOME', 'LANG', 'LC_ALL', 'TMPDIR'];
        passed.forEach((key) => {
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
