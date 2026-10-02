import { rmdirSync, rmSync } from 'node:fs';
import { dirname, join, posix, win32 } from 'node:path';
import type { Settings } from '@shared/types';
import { subtitleFilesOf, type SubtitleFileSystem } from './subtitleFiles';

export const DEFAULT_ANIME_FOLDER = 'Pullwave Anime';
export const MAX_FOLDER_NAME_LENGTH = 100;
// A folder is never shortened below this, whatever the length of the rest of the path.
export const MIN_FOLDER_NAME_LENGTH = 20;
// Windows refuses paths of 260 characters or more (the limit is on by default); a little is left for what ani-cli adds.
export const WINDOWS_PATH_BUDGET = 240;
const FORBIDDEN_FILE_CHARACTERS = new RegExp(`[<>:"/\\\\|?*${String.fromCharCode(0)}-${String.fromCharCode(31)}]`, 'g');
// Names Windows keeps for devices, with or without an extension.
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export interface FolderNameOptions {
    // The system the folder is for (the rules of Windows are stricter).
    platform?: NodeJS.Platform;
    maxLength?: number;
}

// The paths follow the rules of the system the files are on, whichever one this code is running on.
function pathFor(platform: NodeJS.Platform): typeof posix {
    return platform === 'win32' ? win32 : posix;
}

// ani-cli saves the subtitles next to the video with the same name: "<name>.mp4" and "<name>.vtt".
export function subtitlePathFor(videoPath: string): string {
    const extension = posix.extname(videoPath);
    return `${extension.length > 0 ? videoPath.slice(0, -extension.length) : videoPath}.vtt`;
}

// What goes away with a video: the video itself, its subtitles (the one ani-cli picked, the others the source offered and the
// ones the user loaded) and the metadata the app keeps beside it.
export function filesOfEpisode(videoPath: string, files?: SubtitleFileSystem): string[] {
    return [...new Set([videoPath, subtitlePathFor(videoPath), ...subtitleFilesOf(videoPath, files), metadataPathFor(videoPath)])];
}

// The folder of an anime is named after it, without what a file system does not accept. Windows also refuses a name that ends in
// a dot or a space and the names it keeps for devices (CON, NUL, COM1...).
export function animeFolderName(title: string, options: FolderNameOptions = {}): string {
    const { platform = process.platform, maxLength = MAX_FOLDER_NAME_LENGTH } = options;
    let cleaned = title.replace(FORBIDDEN_FILE_CHARACTERS, '_').trim().replace(/^\.+/, '').slice(0, maxLength).trim();
    if (platform === 'win32') {
        cleaned = cleaned.replace(/[. ]+$/, '');
        cleaned = WINDOWS_RESERVED_NAME.test(cleaned) ? `_${cleaned}` : cleaned;
    }
    return cleaned.length > 0 ? cleaned : 'anime';
}

// The file name ani-cli gives an episode: forbidden characters become underscores.
export function animeFileName(title: string, episode: string): string {
    return `${title.replace(FORBIDDEN_FILE_CHARACTERS, '_')} Episode ${episode}.mp4`;
}

// Next to the video of each episode the app keeps what it needs to recognize it again (see episodeMetadata.ts).
export const METADATA_FILE_NAME = 'pullwave.json';

export function metadataPathFor(videoPath: string): string {
    return join(dirname(videoPath), METADATA_FILE_NAME);
}

// Each episode is downloaded into a folder of its own inside the folder of the anime, so its subtitles stay with it.
export const EPISODE_FOLDER_PREFIX = 'Episode ';

export function episodeFolderName(episode: string): string {
    return `${EPISODE_FOLDER_PREFIX}${episode}`;
}

// The folder an episode is downloaded into, inside the folder of its anime.
export function episodeDownloadDirectory(animeDirectory: string, episode: string, platform: NodeJS.Platform = process.platform): string {
    return pathFor(platform).join(animeDirectory, episodeFolderName(episode));
}

// The folder of an episode a video is in, or null when the video is not in one (what was downloaded before each episode had
// its own folder sits in the folder of the anime, which is never the one to remove).
export function episodeFolderOf(videoPath: string, episode: string, platform: NodeJS.Platform = process.platform): string | null {
    const path = pathFor(platform);
    const folder = path.dirname(videoPath);
    return path.basename(folder) === episodeFolderName(episode) ? folder : null;
}

// The folder of the anime a video is in: the one that holds the folders of its episodes or, for what was downloaded before each
// episode had one, the one the video is in.
export function animeFolderOf(videoPath: string, episode: string, platform: NodeJS.Platform = process.platform): string {
    const path = pathFor(platform);
    const episodeFolder = episodeFolderOf(videoPath, episode, platform);
    return path.dirname(episodeFolder ?? videoPath);
}

// How long the folder of an anime may be so that its files (named after the whole title, which ani-cli decides, inside the
// folder of the episode) stay inside the path limit of Windows. Elsewhere the limit is the usual one.
export function folderNameBudget(baseDir: string, title: string, platform: NodeJS.Platform = process.platform): number {
    if (platform !== 'win32') {
        return MAX_FOLDER_NAME_LENGTH;
    }
    const used = baseDir.length + 1 + 1 + episodeFolderName('999').length + 1 + animeFileName(title, '999').length;
    return Math.min(MAX_FOLDER_NAME_LENGTH, Math.max(MIN_FOLDER_NAME_LENGTH, WINDOWS_PATH_BUDGET - used));
}

// The folder all the anime go into: the one in the settings or, by default, a folder inside Downloads.
export function animeBaseDirectory(settings: Settings, defaultDownloadDir: string, platform: NodeJS.Platform = process.platform): string {
    return settings.animeDownloadDir.length > 0 ? settings.animeDownloadDir : pathFor(platform).join(defaultDownloadDir, DEFAULT_ANIME_FOLDER);
}

// The name of the folder of an anime inside `parent`.
function expectedFolderName(parent: string, title: string, platform: NodeJS.Platform): string {
    return animeFolderName(title, { platform, maxLength: folderNameBudget(parent, title, platform) });
}

// The folder the episodes of an anime are saved in, inside `baseDir`.
export function animeDownloadDirectory(baseDir: string, title: string, platform: NodeJS.Platform = process.platform): string {
    return pathFor(platform).join(baseDir, expectedFolderName(baseDir, title, platform));
}

// The folders that go away with an anime: the ones its files are in and the one a download would use now. A folder is
// only ever removed whole when it is named after the anime, so a folder the user chose for the files is never touched.
export function animeFoldersToRemove(title: string, filePaths: readonly string[], baseDir: string, platform: NodeJS.Platform = process.platform): string[] {
    const path = pathFor(platform);
    const candidates = [
        ...filePaths.map((file) => {
            return path.dirname(file);
        }),
        animeDownloadDirectory(baseDir, title, platform)
    ];
    return [...new Set(candidates)].filter((folder) => {
        return path.basename(folder) === expectedFolderName(path.dirname(folder), title, platform);
    });
}

function defaultRemove(path: string): void {
    rmSync(path, { recursive: true, force: true });
}

function defaultRemoveEmpty(path: string): void {
    rmdirSync(path);
}

// Only folders with nothing in them go: one that still has a file (or cannot be removed) is left alone.
export function removeEmptyDirectories(paths: readonly string[], remove: (path: string) => void = defaultRemoveEmpty): void {
    paths.forEach((path) => {
        try {
            remove(path);
        } catch {
            return;
        }
    });
}

// A folder that cannot be removed (still open, no permission) is left alone; the others are still removed.
export function removeDirectories(paths: readonly string[], remove: (path: string) => void = defaultRemove): void {
    paths.forEach((path) => {
        try {
            remove(path);
        } catch {
            return;
        }
    });
}
