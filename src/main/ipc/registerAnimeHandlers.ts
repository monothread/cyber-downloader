import {
    ANIME_AUDIOS,
    type AniError,
    type AnimeAudio,
    type AnimeDownloadRequest,
    type AnimeDownloadResponse,
    type AnimeProgressUpdate,
    type AnimeStreamResponse
} from '@shared/anime';
import { IPC } from '@shared/constants';
import type { AnimeStatus } from '@shared/anime';
import type { UpdateResult } from '@shared/types';
import type { AnimeDb } from '../services/animeDb';
import { animeFoldersToRemove, filesOfEpisode } from '../services/animeFiles';
import type { AnimeDownloadQueue } from '../services/animeDownloadQueue';
import { isValidEpisode, isValidIndex, sanitizeQuery } from '../services/aniArgsBuilder';
import type { AniCliService } from '../services/aniCliService';
import type { StreamSessions } from '../services/streamProxy';
import type { IpcMainLike } from './registerHandlers';

export const MAX_TEXT_LENGTH = 200;
export const MAX_EPISODES_PER_REQUEST = 2000;

export interface AnimeHandlerDependencies {
    service: Pick<AniCliService, 'isAvailable' | 'info' | 'search' | 'episodes' | 'resolveStream'>;
    updateAniCli: () => Promise<UpdateResult>;
    streams: Pick<StreamSessions, 'create' | 'close'>;
    // The quality of the settings, used to pick the stream.
    streamQuality: () => string;
    queue: AnimeDownloadQueue;
    db: AnimeDb;
    removeFiles: (paths: string[]) => void;
    removeFolders: (paths: string[]) => void;
    // The folder all the anime go into, as the settings say now.
    baseDirectory: () => string;
    onLibraryChanged: () => void;
}

const UNSUPPORTED: AniError = { code: 'UNKNOWN', raw: 'The anime section is only available on Linux.' };

function asText(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function asAudio(value: unknown): AnimeAudio | null {
    return ANIME_AUDIOS.find((audio) => {
        return audio === value;
    }) ?? null;
}

function asId(value: unknown): number | null {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;
}

function invalid(raw: string): { ok: false; error: AniError } {
    return { ok: false, error: { code: 'INVALID_SELECTION', raw } };
}

function validQuery(value: unknown): string | null {
    const query = sanitizeQuery(asText(value).slice(0, MAX_TEXT_LENGTH));
    return query.length > 0 ? query : null;
}

// Checks what came from the screen before it reaches ani-cli or the library.
export function parseDownloadRequest(input: unknown): AnimeDownloadRequest | string {
    const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    const title = asText(raw.title).trim().slice(0, MAX_TEXT_LENGTH);
    const query = validQuery(raw.query);
    const audio = asAudio(raw.audio);
    const index = raw.index;
    const episodes = Array.isArray(raw.episodes) ? raw.episodes : [];
    if (title.length === 0 || query === null) {
        return 'The anime name is missing.';
    }
    if (audio === null) {
        return 'The audio must be sub or dub.';
    }
    if (typeof index !== 'number' || !isValidIndex(index)) {
        return 'The position of the anime in the search is invalid.';
    }
    const numbers = [...new Set(episodes.map(asText))];
    if (numbers.length === 0 || numbers.length > MAX_EPISODES_PER_REQUEST || !numbers.every(isValidEpisode)) {
        return 'The episodes are invalid.';
    }
    return { title, query, index, audio, episodes: numbers };
}

export function parseProgress(input: unknown): AnimeProgressUpdate | null {
    const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
    const episodeId = asId(raw.episodeId);
    const { positionSeconds, durationSeconds, watched } = raw;
    if (
        episodeId === null ||
        typeof positionSeconds !== 'number' ||
        typeof durationSeconds !== 'number' ||
        typeof watched !== 'boolean' ||
        !Number.isFinite(positionSeconds) ||
        !Number.isFinite(durationSeconds) ||
        positionSeconds < 0 ||
        durationSeconds < 0
    ) {
        return null;
    }
    return { episodeId, positionSeconds, durationSeconds, watched };
}

// On systems where the section does not exist it still answers, so the screen can tell and hide it.
function registerUnsupported(ipcMain: IpcMainLike): void {
    const status: AnimeStatus = { supported: false, available: false, aniCli: null };
    ipcMain.handle(IPC.animeStatus, () => {
        return status;
    });
    ipcMain.handle(IPC.animeSearch, () => {
        return { ok: false, error: UNSUPPORTED };
    });
    ipcMain.handle(IPC.animeEpisodes, () => {
        return { ok: false, error: UNSUPPORTED };
    });
    ipcMain.handle(IPC.animeDownload, (): AnimeDownloadResponse => {
        return { ok: false, message: UNSUPPORTED.raw };
    });
    ipcMain.handle(IPC.animeLibrary, () => {
        return [];
    });
    ipcMain.handle(IPC.animeJobs, () => {
        return [];
    });
    ipcMain.handle(IPC.animeStreamOpen, (): AnimeStreamResponse => {
        return { ok: false, error: UNSUPPORTED };
    });
    ipcMain.handle(IPC.animeUpdateCli, (): UpdateResult => {
        return { ok: false, output: UNSUPPORTED.raw };
    });
    [IPC.animeCancel, IPC.animeRetry, IPC.animeClearFinished, IPC.animeRemoveEpisode, IPC.animeRemoveAnime, IPC.animeProgress, IPC.animeStreamClose].forEach((channel) => {
        ipcMain.handle(channel, (): void => {
            return undefined;
        });
    });
}

export function registerAnimeHandlers(ipcMain: IpcMainLike, deps: AnimeHandlerDependencies | null): void {
    if (deps === null) {
        registerUnsupported(ipcMain);
        return;
    }
    const { service, queue, db } = deps;

    ipcMain.handle(IPC.animeStatus, (): AnimeStatus => {
        return { supported: true, available: service.isAvailable(), aniCli: service.info() };
    });
    ipcMain.handle(IPC.animeUpdateCli, (): Promise<UpdateResult> => {
        return deps.updateAniCli();
    });
    ipcMain.handle(IPC.animeSearch, async (_event, query, audio) => {
        const cleaned = validQuery(query);
        const chosen = asAudio(audio);
        if (cleaned === null || chosen === null) {
            return invalid('The search is empty or the audio is invalid.');
        }
        const result = await service.search(cleaned, chosen);
        if (result.status === 'done') {
            return { ok: true, results: result.value };
        }
        return { ok: false, error: result.status === 'error' ? result.error : { code: 'UNKNOWN', raw: 'The search was cancelled.' } };
    });
    ipcMain.handle(IPC.animeEpisodes, async (_event, query, index, audio) => {
        const cleaned = validQuery(query);
        const chosen = asAudio(audio);
        if (cleaned === null || chosen === null || typeof index !== 'number' || !isValidIndex(index)) {
            return invalid('The search, the position or the audio is invalid.');
        }
        const result = await service.episodes(cleaned, index, chosen);
        if (result.status === 'done') {
            return { ok: true, episodes: result.value };
        }
        return { ok: false, error: result.status === 'error' ? result.error : { code: 'UNKNOWN', raw: 'The search was cancelled.' } };
    });
    ipcMain.handle(IPC.animeDownload, (_event, input): AnimeDownloadResponse => {
        const request = parseDownloadRequest(input);
        if (typeof request === 'string') {
            return { ok: false, message: request };
        }
        const anime = queue.enqueue(request);
        return anime ? { ok: true, anime } : { ok: false, message: 'The anime could not be saved.' };
    });
    ipcMain.handle(IPC.animeLibrary, () => {
        return db.list();
    });
    ipcMain.handle(IPC.animeJobs, () => {
        return queue.list();
    });
    ipcMain.handle(IPC.animeCancel, (_event, episodeId): void => {
        const id = asId(episodeId);
        if (id !== null) {
            queue.cancel(id);
        }
    });
    ipcMain.handle(IPC.animeRetry, (_event, episodeId): void => {
        const id = asId(episodeId);
        if (id !== null) {
            queue.retry(id);
        }
    });
    ipcMain.handle(IPC.animeClearFinished, (): void => {
        queue.clearFinished();
    });
    // Removing always deletes the files too: what is in the library is what is on the disk.
    ipcMain.handle(IPC.animeRemoveEpisode, (_event, episodeId): void => {
        const id = asId(episodeId);
        if (id === null) {
            return;
        }
        queue.forget([id]);
        const filePath = db.removeEpisode(id);
        if (filePath !== null) {
            deps.removeFiles(filesOfEpisode(filePath));
        }
        deps.onLibraryChanged();
    });
    ipcMain.handle(IPC.animeRemoveAnime, (_event, animeId): void => {
        const id = asId(animeId);
        const anime = id === null ? null : db.getLibraryAnime(id);
        if (id === null || anime === null) {
            return;
        }
        queue.forget(
            anime.episodes.map((episode) => {
                return episode.id;
            })
        );
        const files = db.removeAnime(id);
        deps.removeFiles(files.flatMap(filesOfEpisode));
        deps.removeFolders(animeFoldersToRemove(anime.title, files, deps.baseDirectory()));
        deps.onLibraryChanged();
    });
    ipcMain.handle(IPC.animeStreamOpen, async (_event, input): Promise<AnimeStreamResponse> => {
        const raw = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
        const query = validQuery(raw.query);
        const audio = asAudio(raw.audio);
        const episode = asText(raw.episode);
        const { index } = raw;
        if (query === null || audio === null || typeof index !== 'number' || !isValidIndex(index) || !isValidEpisode(episode)) {
            return invalid('The search, the position, the audio or the episode is invalid.');
        }
        const result = await service.resolveStream({ query, index, audio, episode, quality: deps.streamQuality() });
        if (result.status === 'done') {
            return { ok: true, stream: deps.streams.create(result.value) };
        }
        return { ok: false, error: result.status === 'error' ? result.error : { code: 'UNKNOWN', raw: 'The request was cancelled.' } };
    });
    ipcMain.handle(IPC.animeStreamClose, (_event, sessionId): void => {
        const id = asText(sessionId);
        if (id.length > 0) {
            deps.streams.close(id);
        }
    });
    ipcMain.handle(IPC.animeProgress, (_event, input): void => {
        const update = parseProgress(input);
        if (update !== null) {
            db.saveProgress(update);
        }
    });
}
