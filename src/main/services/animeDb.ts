import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type {
    AniError,
    AniErrorCode,
    AnimeAudio,
    AnimeEpisodeRecord,
    AnimeEpisodeStatus,
    AnimeProgressUpdate,
    AnimeRecord,
    LibraryAnime
} from '@shared/anime';

export const INTERRUPTED_MESSAGE = 'The app was closed before the download finished.';

// Each entry is one schema version, applied in order; `PRAGMA user_version` remembers how many were applied.
const MIGRATIONS: readonly string[] = [
    `CREATE TABLE anime (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        query TEXT NOT NULL,
        search_index INTEGER NOT NULL,
        audio TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE (title, audio)
    );
    CREATE TABLE episode (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        anime_id INTEGER NOT NULL REFERENCES anime (id) ON DELETE CASCADE,
        number TEXT NOT NULL,
        status TEXT NOT NULL,
        file_path TEXT,
        size_bytes INTEGER,
        error_code TEXT,
        error_raw TEXT,
        position_seconds REAL NOT NULL DEFAULT 0,
        duration_seconds REAL NOT NULL DEFAULT 0,
        watched INTEGER NOT NULL DEFAULT 0,
        downloaded_at INTEGER,
        UNIQUE (anime_id, number)
    );`
];

const EPISODE_STATUSES: readonly AnimeEpisodeStatus[] = ['queued', 'downloading', 'done', 'error', 'cancelled'];
const ERROR_CODES: readonly AniErrorCode[] = [
    'NO_RESULTS',
    'BLOCKED',
    'NETWORK',
    'NO_SOURCES',
    'EPISODE_NOT_RELEASED',
    'INVALID_SELECTION',
    'BINARY_MISSING',
    'UNKNOWN'
];

export interface NewAnime {
    title: string;
    query: string;
    searchIndex: number;
    audio: AnimeAudio;
}

type Row = Record<string, unknown>;

function text(row: Row, column: string): string {
    const value = row[column];
    return typeof value === 'string' ? value : '';
}

function nullableText(row: Row, column: string): string | null {
    const value = row[column];
    return typeof value === 'string' ? value : null;
}

function numeric(row: Row, column: string): number {
    const value = row[column];
    return typeof value === 'number' ? value : Number(value ?? 0);
}

function nullableNumeric(row: Row, column: string): number | null {
    const value = row[column];
    return typeof value === 'number' ? value : null;
}

function pick<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
    return allowed.find((candidate) => {
        return candidate === value;
    }) ?? fallback;
}

function toAnime(row: Row): AnimeRecord {
    return {
        id: numeric(row, 'id'),
        title: text(row, 'title'),
        query: text(row, 'query'),
        searchIndex: numeric(row, 'search_index'),
        audio: text(row, 'audio') === 'dub' ? 'dub' : 'sub',
        createdAt: numeric(row, 'created_at')
    };
}

function toError(row: Row): AniError | null {
    const raw = nullableText(row, 'error_raw');
    if (raw === null) {
        return null;
    }
    return { code: pick(text(row, 'error_code'), ERROR_CODES, 'UNKNOWN'), raw };
}

function toEpisode(row: Row): AnimeEpisodeRecord {
    return {
        id: numeric(row, 'id'),
        animeId: numeric(row, 'anime_id'),
        number: text(row, 'number'),
        status: pick(text(row, 'status'), EPISODE_STATUSES, 'error'),
        filePath: nullableText(row, 'file_path'),
        sizeBytes: nullableNumeric(row, 'size_bytes'),
        error: toError(row),
        positionSeconds: numeric(row, 'position_seconds'),
        durationSeconds: numeric(row, 'duration_seconds'),
        watched: numeric(row, 'watched') === 1,
        downloadedAt: nullableNumeric(row, 'downloaded_at')
    };
}

// Episodes are numbered with text ("12", "12.5"), so they are ordered as numbers.
function compareEpisodes(first: AnimeEpisodeRecord, second: AnimeEpisodeRecord): number {
    return Number(first.number) - Number(second.number);
}

export class AnimeDb {
    private readonly db: DatabaseSync;

    constructor(
        path: string,
        private readonly now: () => number = Date.now
    ) {
        if (path !== ':memory:') {
            mkdirSync(dirname(path), { recursive: true });
        }
        this.db = new DatabaseSync(path);
        try {
            this.db.exec('PRAGMA foreign_keys = ON');
            this.migrate();
        } catch (error) {
            // The file must not stay open (and locked, on Windows) when the library cannot be used.
            this.db.close();
            throw error;
        }
    }

    private migrate(): void {
        const current = numeric(this.one('PRAGMA user_version') ?? {}, 'user_version');
        MIGRATIONS.slice(current).forEach((migration, offset) => {
            this.db.exec('BEGIN');
            try {
                this.db.exec(migration);
                this.db.exec(`PRAGMA user_version = ${current + offset + 1}`);
                this.db.exec('COMMIT');
            } catch (error) {
                this.db.exec('ROLLBACK');
                throw error;
            }
        });
    }

    private one(sql: string, ...params: SQLInputValue[]): Row | null {
        return (this.db.prepare(sql).get(...params) as Row | undefined) ?? null;
    }

    private all(sql: string, ...params: SQLInputValue[]): Row[] {
        return this.db.prepare(sql).all(...params) as Row[];
    }

    private run(sql: string, ...params: SQLInputValue[]): void {
        this.db.prepare(sql).run(...params);
    }

    get schemaVersion(): number {
        return numeric(this.one('PRAGMA user_version') ?? {}, 'user_version');
    }

    close(): void {
        this.db.close();
    }

    // The same title and audio is the same anime: its search data is refreshed, because the position can change.
    upsertAnime(input: NewAnime): AnimeRecord {
        const row = this.one(
            `INSERT INTO anime (title, query, search_index, audio, created_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (title, audio) DO UPDATE SET query = excluded.query, search_index = excluded.search_index
             RETURNING *`,
            input.title,
            input.query,
            input.searchIndex,
            input.audio,
            this.now()
        );
        return toAnime(row ?? {});
    }

    // A new episode is queued. One that is already downloaded stays as it is; any other one is queued again.
    ensureEpisode(animeId: number, number: string): AnimeEpisodeRecord {
        const row = this.one(
            `INSERT INTO episode (anime_id, number, status) VALUES (?, ?, 'queued')
             ON CONFLICT (anime_id, number) DO UPDATE SET
                status = CASE WHEN status = 'done' THEN status ELSE 'queued' END,
                error_code = CASE WHEN status = 'done' THEN error_code ELSE NULL END,
                error_raw = CASE WHEN status = 'done' THEN error_raw ELSE NULL END
             RETURNING *`,
            animeId,
            number
        );
        return toEpisode(row ?? {});
    }

    getAnime(id: number): AnimeRecord | null {
        const row = this.one('SELECT * FROM anime WHERE id = ?', id);
        return row ? toAnime(row) : null;
    }

    getEpisode(id: number): AnimeEpisodeRecord | null {
        const row = this.one('SELECT * FROM episode WHERE id = ?', id);
        return row ? toEpisode(row) : null;
    }

    getLibraryAnime(id: number): LibraryAnime | null {
        const anime = this.getAnime(id);
        return anime ? { ...anime, episodes: this.episodesOf(id) } : null;
    }

    private episodesOf(animeId: number): AnimeEpisodeRecord[] {
        return this.all('SELECT * FROM episode WHERE anime_id = ?', animeId).map(toEpisode).sort(compareEpisodes);
    }

    list(): LibraryAnime[] {
        return this.all('SELECT * FROM anime ORDER BY title COLLATE NOCASE, audio').map((row) => {
            const anime = toAnime(row);
            return { ...anime, episodes: this.episodesOf(anime.id) };
        });
    }

    markDownloading(episodeId: number): void {
        this.run(`UPDATE episode SET status = 'downloading', error_code = NULL, error_raw = NULL WHERE id = ?`, episodeId);
    }

    markDone(episodeId: number, filePath: string, sizeBytes: number | null): void {
        this.run(
            `UPDATE episode SET status = 'done', file_path = ?, size_bytes = ?, error_code = NULL, error_raw = NULL, downloaded_at = ? WHERE id = ?`,
            filePath,
            sizeBytes,
            this.now(),
            episodeId
        );
    }

    markFailed(episodeId: number, status: 'error' | 'cancelled', error: AniError | null): void {
        this.run(`UPDATE episode SET status = ?, error_code = ?, error_raw = ? WHERE id = ?`, status, error?.code ?? null, error?.raw ?? null, episodeId);
    }

    // The queue lives in memory: whatever was waiting or downloading when the app closed will not continue by itself.
    failInterrupted(): void {
        this.run(
            `UPDATE episode SET status = 'error', error_code = 'UNKNOWN', error_raw = ? WHERE status IN ('queued', 'downloading')`,
            INTERRUPTED_MESSAGE
        );
    }

    saveProgress(update: AnimeProgressUpdate): void {
        this.run(
            `UPDATE episode SET position_seconds = ?, duration_seconds = ?, watched = ? WHERE id = ?`,
            update.positionSeconds,
            update.durationSeconds,
            update.watched ? 1 : 0,
            update.episodeId
        );
    }

    // Both remove the records and give back the files they pointed at, so the caller can delete them if asked to.
    removeEpisode(episodeId: number): string | null {
        const filePath = this.getEpisode(episodeId)?.filePath ?? null;
        this.run('DELETE FROM episode WHERE id = ?', episodeId);
        return filePath;
    }

    removeAnime(animeId: number): string[] {
        const files = this.episodesOf(animeId).flatMap((episode) => {
            return episode.filePath === null ? [] : [episode.filePath];
        });
        this.run('DELETE FROM anime WHERE id = ?', animeId);
        return files;
    }
}
