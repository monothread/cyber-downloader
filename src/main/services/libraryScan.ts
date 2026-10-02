import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import type { AnimeAudio } from '@shared/anime';
import { readEpisodeMetadata } from './episodeMetadata';

export const VIDEO_EXTENSIONS: readonly string[] = ['.mp4', '.mkv', '.webm', '.m4v'];
// The folder that is chosen can be the one of all the anime, one anime or one episode: videos are looked for this deep.
export const MAX_SCAN_DEPTH = 3;
const EPISODE_FOLDER = /^Episode (\d+(?:\.\d+)?)$/;
const EPISODE_FILE = /^(.*\S) Episode (\d+(?:\.\d+)?)$/;

export interface ScanEntry {
    name: string;
    directory: boolean;
}

export interface ScanFileSystem {
    // What is in a folder; nothing when it cannot be read.
    entries: (directory: string) => ScanEntry[];
    read: (path: string) => string | null;
}

export const defaultScanFileSystem: ScanFileSystem = {
    entries: (directory) => {
        try {
            return readdirSync(directory, { withFileTypes: true }).map((entry) => {
                return { name: entry.name, directory: entry.isDirectory() };
            });
        } catch {
            return [];
        }
    },
    read: (path) => {
        try {
            return readFileSync(path, 'utf-8');
        } catch {
            return null;
        }
    }
};

export interface ScannedEpisode {
    videoPath: string;
    title: string;
    number: string;
    // Null when nothing says which audio it is.
    audio: AnimeAudio | null;
    query: string;
    // 0 when it is not known.
    searchIndex: number;
    progress: { positionSeconds: number; durationSeconds: number; watched: boolean } | null;
}

export interface ScanResult {
    episodes: ScannedEpisode[];
    // Videos that were found but could not be told which episode they are.
    ignored: number;
}

function withoutExtension(fileName: string): string {
    const extension = extname(fileName);
    return extension.length > 0 ? fileName.slice(0, -extension.length) : fileName;
}

// What the names alone say about a video (the metadata file says more, when it is there): ani-cli names a file
// "<title> Episode <number>", and the app puts it in "Episode <number>" inside the folder of the anime.
function episodeFromNames(videoPath: string): Pick<ScannedEpisode, 'title' | 'number'> | null {
    const folder = basename(dirname(videoPath));
    const fromFolder = EPISODE_FOLDER.exec(folder)?.[1];
    const fromFile = EPISODE_FILE.exec(withoutExtension(basename(videoPath)));
    const number = fromFolder ?? fromFile?.[2];
    if (number === undefined) {
        return null;
    }
    const animeFolder = fromFolder === undefined ? folder : basename(dirname(dirname(videoPath)));
    const title = fromFile && fromFile[2] === number ? fromFile[1] : animeFolder;
    return title !== undefined && title.length > 0 ? { title, number } : null;
}

function scanOne(videoPath: string, files: ScanFileSystem): ScannedEpisode | null {
    const metadata = readEpisodeMetadata(videoPath, files);
    if (metadata) {
        return {
            videoPath,
            title: metadata.title,
            number: metadata.number,
            audio: metadata.audio,
            query: metadata.query,
            searchIndex: metadata.searchIndex,
            progress: { positionSeconds: metadata.positionSeconds, durationSeconds: metadata.durationSeconds, watched: metadata.watched }
        };
    }
    const names = episodeFromNames(videoPath);
    return names ? { videoPath, ...names, audio: null, query: names.title, searchIndex: 0, progress: null } : null;
}

// The episodes in a folder and the folders inside it, in a steady order.
export function scanLibraryFolder(root: string, files: ScanFileSystem = defaultScanFileSystem): ScanResult {
    const episodes: ScannedEpisode[] = [];
    let ignored = 0;
    const walk = (directory: string, depth: number): void => {
        const entries = files.entries(directory).sort((first, second) => {
            return first.name.localeCompare(second.name);
        });
        entries.forEach((entry) => {
            const path = join(directory, entry.name);
            if (entry.directory) {
                if (depth < MAX_SCAN_DEPTH) {
                    walk(path, depth + 1);
                }
                return;
            }
            if (!VIDEO_EXTENSIONS.includes(extname(entry.name).toLowerCase())) {
                return;
            }
            const found = scanOne(path, files);
            if (found) {
                episodes.push(found);
            } else {
                ignored += 1;
            }
        });
    };
    walk(root, 0);
    return { episodes, ignored };
}
