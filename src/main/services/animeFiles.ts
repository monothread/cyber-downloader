import { rmSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { Settings } from '@shared/types';

export const DEFAULT_ANIME_FOLDER = 'Pullwave Anime';
const MAX_FOLDER_NAME_LENGTH = 100;
const FORBIDDEN_FILE_CHARACTERS = new RegExp(`[<>:"/\\\\|?*${String.fromCharCode(0)}-${String.fromCharCode(31)}]`, 'g');

// ani-cli saves the subtitles next to the video with the same name: "<name>.mp4" and "<name>.vtt".
export function subtitlePathFor(videoPath: string): string {
    const extension = extname(videoPath);
    return `${extension.length > 0 ? videoPath.slice(0, -extension.length) : videoPath}.vtt`;
}

// What goes away with a video: the video itself and its subtitles.
export function filesOfEpisode(videoPath: string): string[] {
    return [videoPath, subtitlePathFor(videoPath)];
}

// The folder of an anime is named after it, without what a file system does not accept.
export function animeFolderName(title: string): string {
    const cleaned = title.replace(FORBIDDEN_FILE_CHARACTERS, '_').trim().replace(/^\.+/, '').slice(0, MAX_FOLDER_NAME_LENGTH).trim();
    return cleaned.length > 0 ? cleaned : 'anime';
}

// The file name ani-cli gives an episode: forbidden characters become underscores.
export function animeFileName(title: string, episode: string): string {
    return `${title.replace(FORBIDDEN_FILE_CHARACTERS, '_')} Episode ${episode}.mp4`;
}

// The folder all the anime go into: the one in the settings or, by default, a folder inside Downloads.
export function animeBaseDirectory(settings: Settings, defaultDownloadDir: string): string {
    return settings.animeDownloadDir.length > 0 ? settings.animeDownloadDir : join(defaultDownloadDir, DEFAULT_ANIME_FOLDER);
}

// The folders that go away with an anime: the ones its files are in and the one a download would use now. A folder is
// only ever removed whole when it is named after the anime, so a folder the user chose for the files is never touched.
export function animeFoldersToRemove(title: string, filePaths: readonly string[], baseDir: string): string[] {
    const name = animeFolderName(title);
    const candidates = [...filePaths.map(dirname), join(baseDir, name)];
    return [...new Set(candidates)].filter((folder) => {
        return basename(folder) === name;
    });
}

function defaultRemove(path: string): void {
    rmSync(path, { recursive: true, force: true });
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
