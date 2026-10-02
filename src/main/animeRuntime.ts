import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isAnimeSupported } from '@shared/anime';
import { IPC } from '@shared/constants';
import { resolveLanguage } from '@shared/i18n';
import type { Settings } from '@shared/types';
import type { AnimeHandlerDependencies } from './ipc/registerAnimeHandlers';
import { AniCliLocator, readTextFile } from './services/aniCliLocator';
import { createDefaultUpdaterDependencies, updateAniCli, type AniCliUpdaterDependencies } from './services/aniCliUpdater';
import { AniCliService } from './services/aniCliService';
import { subtitleLabels } from './services/aniSubtitles';
import { AnimeDb } from './services/animeDb';
import { AnimeDownloadQueue } from './services/animeDownloadQueue';
import { animeBaseDirectory, removeDirectories, removeEmptyDirectories } from './services/animeFiles';
import type { BinaryResolver } from './services/binaryResolver';
import type { MediaSource } from './services/mediaProtocol';
import { createStreamHandler, StreamSessions } from './services/streamProxy';
import { removeFiles } from './services/partialFiles';
import { refreshEpisodeMetadata } from './services/episodeMetadata';
import { importLibrary } from './services/libraryImport';
import { scanLibraryFolder, type ScanFileSystem } from './services/libraryScan';
import { defaultSubtitleFileSystem, importSubtitle, listSubtitleTracks, resolveSubtitlePath, type SubtitleFileSystem } from './services/subtitleFiles';

// A file the player has just let go of can still be held for a moment (Windows will not delete it then): what is left is
// removed again after this long.
export const REMOVE_RETRY_MS = 500;

export interface AnimeRuntimeOptions {
    platform: NodeJS.Platform;
    // userData: the library lives in <dataDir>/anime.
    dataDir: string;
    // resources/bin and resources/ani-scripts (inside the package once built).
    bundledDir: string;
    scriptsDir: string;
    defaultDownloadDir: string;
    resolver: BinaryResolver;
    getSettings: () => Settings;
    // The language of the system, which the interface (and so the subtitles) follows when it is set to "device".
    systemLocale: string;
    // A different ani-cli to run instead of the one that ships with the app (used by the end-to-end tests).
    customScriptPath?: () => string;
    // How files and folders are deleted (the tests replace it).
    remover?: { files: (paths: string[]) => void; folders: (paths: string[]) => void; emptyFolders?: (paths: string[]) => void };
    // How long to wait before removing again what could not be removed at first (the tests make it short).
    removeRetryMs?: number;
    // How the update of ani-cli reaches the network and checks what it got (the end-to-end tests replace it).
    updaterDependencies?: AniCliUpdaterDependencies;
    // Asks the user for a folder of anime to put into the library, starting at the given folder; null when they gave up (the
    // tests replace it).
    chooseLibraryFolder?: (startAt: string) => Promise<string | null>;
    // How the folders of anime are read (the tests replace it).
    scanFiles?: ScanFileSystem;
    // Opens a folder in the file manager of the system (the tests replace it).
    openFolder?: (path: string) => void;
    // Asks the user for a subtitle file to load; null when they gave up (the tests replace it).
    chooseSubtitleFile?: () => Promise<string | null>;
    // How the files next to a video are read and written (the tests replace it).
    subtitleFiles?: SubtitleFileSystem;
    send: (channel: string, payload?: unknown) => void;
}

export interface AnimeRuntime {
    db: AnimeDb;
    queue: AnimeDownloadQueue;
    handlers: AnimeHandlerDependencies;
    media: MediaSource;
    // Answers the requests of the player for a stream that is being watched without downloading it.
    streamHandler: (request: Request) => Promise<Response>;
}

function fileSize(path: string): number | null {
    try {
        const stats = statSync(path);
        return stats.isFile() ? stats.size : null;
    } catch {
        return null;
    }
}

function removeAgainLater(paths: string[], remove: (paths: string[]) => void, milliseconds: number): void {
    setTimeout(() => {
        const left = paths.filter((path) => {
            return existsSync(path);
        });
        if (left.length > 0) {
            remove(left);
        }
    }, milliseconds).unref();
}

// Everything the anime section needs, or null where it does not exist (it is available on Linux and Windows).
export function createAnimeRuntime(options: AnimeRuntimeOptions): AnimeRuntime | null {
    if (!isAnimeSupported(options.platform)) {
        return null;
    }
    const animeDir = join(options.dataDir, 'anime');
    const db = new AnimeDb(join(animeDir, 'anime.db'));
    // The queue lives in memory: what was not finished when the app closed has to be started again by the user.
    db.failInterrupted();
    const locator = new AniCliLocator(
        {
            bundledDir: options.bundledDir,
            scriptsDir: options.scriptsDir,
            userBinDir: join(options.dataDir, 'bin'),
            dataDir: animeDir
        },
        undefined,
        options.platform
    );
    const customScriptPath = options.customScriptPath ?? ((): string => {
        return '';
    });
    const service = new AniCliService({
        locator,
        customScriptPath,
        subtitleLabels: () => {
            const settings = options.getSettings();
            return subtitleLabels(settings.animeSubtitles, resolveLanguage(settings.language, options.systemLocale));
        },
        tools: () => {
            const settings = options.getSettings();
            return { ytdlp: options.resolver.ytdlp(settings), ffmpeg: options.resolver.ffmpeg(settings) };
        }
    });
    const queue = new AnimeDownloadQueue({
        db,
        download: (request) => {
            return service.download(request);
        },
        getSettings: options.getSettings,
        defaultDownloadDir: options.defaultDownloadDir,
        platform: options.platform,
        ensureDirectory: (path) => {
            mkdirSync(path, { recursive: true });
        },
        fileSize,
        directoryExists: (path) => {
            return existsSync(path);
        },
        onEpisodeDownloaded: (episodeId) => {
            refreshEpisodeMetadata(db, episodeId, options.subtitleFiles ?? defaultSubtitleFileSystem, options.platform);
        },
        onJobUpdate: (job) => {
            options.send(IPC.eventAnimeJob, job);
        },
        onLibraryChanged: () => {
            options.send(IPC.eventAnimeLibrary);
        }
    });
    // The video of a downloaded episode, or null when it has none.
    const downloadedFile = (episodeId: number): string | null => {
        const episode = db.getEpisode(episodeId);
        return episode && episode.status === 'done' ? episode.filePath : null;
    };
    const media: MediaSource = {
        resolve: (kind, episodeId, trackId) => {
            const filePath = downloadedFile(episodeId);
            if (filePath === null) {
                return null;
            }
            return kind === 'episode' ? filePath : resolveSubtitlePath(filePath, trackId, options.subtitleFiles);
        }
    };
    const streams = new StreamSessions();
    return {
        db,
        queue,
        media,
        streamHandler: createStreamHandler(streams),
        handlers: {
            service,
            updateAniCli: () => {
                return updateAniCli(locator, customScriptPath(), options.updaterDependencies ?? createDefaultUpdaterDependencies(locator.busyboxPath, readTextFile));
            },
            streams,
            streamQuality: () => {
                return options.getSettings().animeQuality;
            },
            queue,
            db,
            removeFiles: (paths) => {
                const remove = options.remover?.files ?? removeFiles;
                remove(paths);
                removeAgainLater(paths, remove, options.removeRetryMs ?? REMOVE_RETRY_MS);
            },
            removeFolders: (paths) => {
                const remove = options.remover?.folders ?? removeDirectories;
                remove(paths);
                removeAgainLater(paths, remove, options.removeRetryMs ?? REMOVE_RETRY_MS);
            },
            removeEmptyFolders: (paths) => {
                const remove = options.remover?.emptyFolders ?? removeEmptyDirectories;
                remove(paths);
                removeAgainLater(paths, remove, options.removeRetryMs ?? REMOVE_RETRY_MS);
            },
            fileExists: (path) => {
                return fileSize(path) !== null;
            },
            refreshMetadata: (episodeId) => {
                refreshEpisodeMetadata(db, episodeId, options.subtitleFiles ?? defaultSubtitleFileSystem, options.platform);
            },
            importLibrary: async () => {
                const settings = options.getSettings();
                const startAt = animeBaseDirectory(settings, options.defaultDownloadDir, options.platform);
                const chosen = await (options.chooseLibraryFolder?.(startAt) ?? Promise.resolve(null));
                if (chosen === null) {
                    return { ok: false, reason: 'cancelled' };
                }
                const summary = importLibrary(db, scanLibraryFolder(chosen, options.scanFiles), {
                    defaultAudio: settings.animeAudio,
                    fileSize,
                    onEpisodeSaved: (episodeId) => {
                        refreshEpisodeMetadata(db, episodeId, options.subtitleFiles ?? defaultSubtitleFileSystem, options.platform);
                    }
                });
                return { ok: true, ...summary };
            },
            openFolder: (path) => {
                options.openFolder?.(path);
            },
            platform: options.platform,
            baseDirectory: () => {
                return animeBaseDirectory(options.getSettings(), options.defaultDownloadDir, options.platform);
            },
            onLibraryChanged: () => {
                options.send(IPC.eventAnimeLibrary);
            },
            subtitles: {
                list: (episodeId) => {
                    const filePath = downloadedFile(episodeId);
                    return filePath === null ? [] : listSubtitleTracks(filePath, options.subtitleFiles);
                },
                import: async (episodeId) => {
                    const filePath = downloadedFile(episodeId);
                    if (filePath === null) {
                        return { ok: false, reason: 'missing' };
                    }
                    return importSubtitle(filePath, {
                        chooseFile: options.chooseSubtitleFile ?? ((): Promise<string | null> => {
                            return Promise.resolve(null);
                        }),
                        files: options.subtitleFiles
                    });
                }
            }
        }
    };
}
