import { copyFileSync, constants, existsSync, mkdirSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import type { AnimeMigrationFailure, AnimeMigrationProgress, LibraryAnime } from '@shared/anime';
import type { AnimeDb } from './animeDb';
import {
    animeDownloadDirectory,
    animeFolderOf,
    episodeDownloadDirectory,
    episodeFolderOf,
    filesOfEpisode,
    isInsideDirectory,
    removeEmptyDirectories,
    seasonDownloadDirectory,
    seriesFolderOf
} from './animeFiles';

// What the migration does to the disk (the tests replace it).
export interface MigrationFileSystem {
    // The size of a file, or null when it is not there.
    size: (path: string) => number | null;
    exists: (path: string) => boolean;
    makeDirectory: (path: string) => void;
    // Copies a file; it fails when the destination is already there.
    copy: (from: string, to: string) => Promise<void>;
    removeFile: (path: string) => void;
    // Removes a folder only when nothing is left in it (it fails otherwise).
    removeEmptyDirectory: (path: string) => void;
}

export const defaultMigrationFileSystem: MigrationFileSystem = {
    size: (path) => {
        try {
            const stats = statSync(path);
            return stats.isFile() ? stats.size : null;
        } catch {
            return null;
        }
    },
    exists: (path) => {
        return existsSync(path);
    },
    makeDirectory: (path) => {
        mkdirSync(path, { recursive: true });
    },
    copy: (from, to) => {
        // Large videos are copied without holding the rest of the app: the copy runs in a thread of the system.
        return new Promise((resolve, reject) => {
            setImmediate(() => {
                try {
                    copyFileSync(from, to, constants.COPYFILE_EXCL);
                    resolve();
                } catch (error) {
                    reject(error instanceof Error ? error : new Error(String(error)));
                }
            });
        });
    },
    removeFile: (path) => {
        rmSync(path, { force: true });
    },
    removeEmptyDirectory: (path) => {
        rmdirSync(path);
    }
};

export interface MigrationDependencies {
    db: Pick<AnimeDb, 'list' | 'relinkEpisodes'>;
    // The files of an episode (see filesOfEpisode); only the ones that are on the disk are moved.
    filesOf?: (videoPath: string) => string[];
    files?: MigrationFileSystem;
    platform: NodeJS.Platform;
    // The folder the anime are in now, and the one they are moved to.
    currentDirectory: string;
    newDirectory: string;
    // Saves the new folder in the settings.
    saveDirectory: (directory: string) => void;
    onProgress: (progress: AnimeMigrationProgress) => void;
}

export type MigrationOutcome = { ok: true; episodes: number; files: number } | { ok: false; reason: Exclude<AnimeMigrationFailure, 'cancelled' | 'busy'> };

interface PlannedFile {
    from: string;
    to: string;
}

interface PlannedEpisode {
    episodeId: number;
    number: string;
    oldVideoPath: string;
    oldSizeBytes: number | null;
    newVideoPath: string;
    files: PlannedFile[];
}

function pathFor(platform: NodeJS.Platform): typeof posix {
    return platform === 'win32' ? win32 : posix;
}

// The folder of an episode inside the new folder: the same layout downloads use ("<series>/Season N/Episode M" for a season of a
// series, "<anime>/Episode M" for an anime on its own), wherever the episode was before.
function newEpisodeFolder(anime: LibraryAnime, number: string, newDirectory: string, platform: NodeJS.Platform): string {
    const folder =
        anime.series !== null && anime.season !== null
            ? seasonDownloadDirectory(newDirectory, anime.series, anime.season, anime.title, platform)
            : animeDownloadDirectory(newDirectory, anime.title, platform);
    return episodeDownloadDirectory(folder, number, platform);
}

// What has to be moved: every downloaded episode whose video is on the disk, with its files. An episode whose video is gone has
// nothing to move and stays as it is.
function planEpisodes(library: readonly LibraryAnime[], dependencies: MigrationDependencies, files: MigrationFileSystem): PlannedEpisode[] {
    const { platform, newDirectory } = dependencies;
    const path = pathFor(platform);
    const filesOf = dependencies.filesOf ?? filesOfEpisode;
    return library.flatMap((anime) => {
        return anime.episodes.flatMap((episode) => {
            if (episode.status !== 'done' || episode.filePath === null || files.size(episode.filePath) === null) {
                return [];
            }
            const folder = newEpisodeFolder(anime, episode.number, newDirectory, platform);
            const planned = filesOf(episode.filePath)
                .filter((file) => {
                    return files.exists(file);
                })
                .map((file) => {
                    return { from: file, to: path.join(folder, path.basename(file)) };
                });
            return [
                {
                    episodeId: episode.id,
                    number: episode.number,
                    oldVideoPath: episode.filePath,
                    oldSizeBytes: episode.sizeBytes,
                    newVideoPath: path.join(folder, path.basename(episode.filePath)),
                    files: planned
                }
            ];
        });
    });
}

// A file that is already in the new folder, or that two episodes would be copied to, is in the way: nothing is overwritten.
function hasConflict(episodes: readonly PlannedEpisode[], files: MigrationFileSystem): boolean {
    const destinations = new Set<string>();
    return episodes
        .flatMap((episode) => {
            return episode.files;
        })
        .some((file) => {
            if (destinations.has(file.to) || files.exists(file.to)) {
                return true;
            }
            destinations.add(file.to);
            return false;
        });
}

// The folders a new file needs that are not there yet, the deepest first.
function missingFolders(directory: string, files: MigrationFileSystem, platform: NodeJS.Platform): string[] {
    const missing: string[] = [];
    let current = directory;
    const path = pathFor(platform);
    while (!files.exists(current) && path.dirname(current) !== current) {
        missing.push(current);
        current = path.dirname(current);
    }
    return missing;
}

function byDepth(folders: Iterable<string>): string[] {
    return [...folders].sort((first, second) => {
        return second.length - first.length;
    });
}

// What was copied is removed again, and so are the folders that were made for it.
function undoCopy(copied: readonly string[], created: ReadonlySet<string>, files: MigrationFileSystem): void {
    copied.forEach((file) => {
        try {
            files.removeFile(file);
        } catch {
            return;
        }
    });
    byDepth(created).forEach((folder) => {
        try {
            files.removeEmptyDirectory(folder);
        } catch {
            return;
        }
    });
}

// Every copy has to be there with the size of the original.
function copiesAreComplete(episodes: readonly PlannedEpisode[], files: MigrationFileSystem): boolean {
    return episodes
        .flatMap((episode) => {
            return episode.files;
        })
        .every((file) => {
            const original = files.size(file.from);
            return original !== null && files.size(file.to) === original;
        });
}

// The folders of the old files that nothing is left in once the files are gone: the folder of each episode, the one of its anime
// or season and the one of its series, and the old folder of the anime itself. Only empty folders are ever removed.
function foldersToClean(episodes: readonly PlannedEpisode[], dependencies: MigrationDependencies): string[] {
    const { platform, currentDirectory } = dependencies;
    const folders = new Set<string>();
    episodes.forEach((episode) => {
        const episodeFolder = episodeFolderOf(episode.oldVideoPath, episode.number, platform);
        const animeFolder = animeFolderOf(episode.oldVideoPath, episode.number, platform);
        const seriesFolder = seriesFolderOf(animeFolder, platform);
        // A video that is not in a folder of its own episode is in a folder the user chose: it is only removed when it is in the
        // folder of the library.
        const ownFolders = episodeFolder === null && !isInsideDirectory(animeFolder, currentDirectory, platform) ? [] : [animeFolder, seriesFolder];
        [episodeFolder, ...ownFolders].forEach((folder) => {
            if (folder !== null) {
                folders.add(folder);
            }
        });
    });
    // The folder the anime were in goes too, but only when it is the one of the library and has nothing left.
    const path = pathFor(platform);
    return [
        ...byDepth(folders).filter((folder) => {
            return folder !== path.resolve(currentDirectory);
        }),
        currentDirectory
    ];
}

// Moves what the library has to a new folder, safely: the files are copied, each copy is checked against the original, the library
// and the settings are pointed to the copies and only then are the old files removed (and the folders left empty). If anything fails
// before that, the copies are removed and nothing changes.
export async function migrateAnimeFolder(dependencies: MigrationDependencies): Promise<MigrationOutcome> {
    const { db, platform, currentDirectory, newDirectory } = dependencies;
    const files = dependencies.files ?? defaultMigrationFileSystem;
    const path = pathFor(platform);
    if (path.resolve(newDirectory) === path.resolve(currentDirectory)) {
        return { ok: false, reason: 'same' };
    }
    if (isInsideDirectory(newDirectory, currentDirectory, platform)) {
        return { ok: false, reason: 'inside' };
    }
    const episodes = planEpisodes(db.list(), dependencies, files);
    if (hasConflict(episodes, files)) {
        return { ok: false, reason: 'conflict' };
    }
    const plan = episodes.flatMap((episode) => {
        return episode.files;
    });
    const copied: string[] = [];
    const created = new Set<string>();
    dependencies.onProgress({ done: 0, total: plan.length });
    try {
        for (const file of plan) {
            const folder = path.dirname(file.to);
            missingFolders(folder, files, platform).forEach((missing) => {
                created.add(missing);
            });
            files.makeDirectory(folder);
            await files.copy(file.from, file.to);
            copied.push(file.to);
            dependencies.onProgress({ done: copied.length, total: plan.length });
        }
        if (!copiesAreComplete(episodes, files)) {
            throw new Error('A copy is not like its original.');
        }
    } catch {
        undoCopy(copied, created, files);
        return { ok: false, reason: 'failed' };
    }
    try {
        db.relinkEpisodes(
            episodes.map((episode) => {
                return { episodeId: episode.episodeId, filePath: episode.newVideoPath, sizeBytes: files.size(episode.newVideoPath) };
            })
        );
        dependencies.saveDirectory(newDirectory);
    } catch {
        db.relinkEpisodes(
            episodes.map((episode) => {
                return { episodeId: episode.episodeId, filePath: episode.oldVideoPath, sizeBytes: episode.oldSizeBytes };
            })
        );
        undoCopy(copied, created, files);
        return { ok: false, reason: 'failed' };
    }
    removeOldFiles(plan, foldersToClean(episodes, dependencies), files);
    return { ok: true, episodes: episodes.length, files: plan.length };
}

// The old files go, one by one (one that cannot be removed is left where it is), then the folders that have nothing left in them.
function removeOldFiles(plan: readonly PlannedFile[], folders: readonly string[], files: MigrationFileSystem): void {
    plan.forEach((file) => {
        try {
            files.removeFile(file.from);
        } catch {
            return;
        }
    });
    removeEmptyDirectories(folders, (folder) => {
        files.removeEmptyDirectory(folder);
    });
}
