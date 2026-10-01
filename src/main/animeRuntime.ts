import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
import { animeBaseDirectory, removeDirectories, subtitlePathFor } from './services/animeFiles';
import type { BinaryResolver } from './services/binaryResolver';
import type { MediaSource } from './services/mediaProtocol';
import { createStreamHandler, StreamSessions } from './services/streamProxy';
import { removeFiles } from './services/partialFiles';

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
    // How the update of ani-cli reaches the network and checks what it got (the end-to-end tests replace it).
    updaterDependencies?: AniCliUpdaterDependencies;
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

// Everything the anime section needs, or null where it does not exist (it is Linux only).
export function createAnimeRuntime(options: AnimeRuntimeOptions): AnimeRuntime | null {
    if (options.platform !== 'linux') {
        return null;
    }
    const animeDir = join(options.dataDir, 'anime');
    const db = new AnimeDb(join(animeDir, 'anime.db'));
    // The queue lives in memory: what was not finished when the app closed has to be started again by the user.
    db.failInterrupted();
    const locator = new AniCliLocator({
        bundledDir: options.bundledDir,
        scriptsDir: options.scriptsDir,
        userBinDir: join(options.dataDir, 'bin'),
        dataDir: animeDir
    });
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
        ensureDirectory: (path) => {
            mkdirSync(path, { recursive: true });
        },
        fileSize,
        onJobUpdate: (job) => {
            options.send(IPC.eventAnimeJob, job);
        },
        onLibraryChanged: () => {
            options.send(IPC.eventAnimeLibrary);
        }
    });
    const media: MediaSource = {
        resolve: (kind, episodeId) => {
            const episode = db.getEpisode(episodeId);
            if (!episode || episode.status !== 'done' || episode.filePath === null) {
                return null;
            }
            return kind === 'episode' ? episode.filePath : subtitlePathFor(episode.filePath);
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
                removeFiles(paths);
            },
            removeFolders: (paths) => {
                removeDirectories(paths);
            },
            baseDirectory: () => {
                return animeBaseDirectory(options.getSettings(), options.defaultDownloadDir);
            },
            onLibraryChanged: () => {
                options.send(IPC.eventAnimeLibrary);
            }
        }
    };
}
