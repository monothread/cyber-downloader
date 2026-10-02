import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AnimeDb, INTERRUPTED_MESSAGE, type NewAnime } from '@main/services/animeDb';
import { cleanTempDirs, makeTempDir } from '../../helpers/tempDir';

const NARUTO: NewAnime = { title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' };
const NOW = 1_700_000_000_000;

function makeDb(): AnimeDb {
    return new AnimeDb(':memory:', () => {
        return NOW;
    });
}

afterEach(() => {
    cleanTempDirs();
});

describe('AnimeDb schema', () => {
    it('applies the migrations and remembers the version', () => {
        expect(makeDb().schemaVersion).toBe(3);
    });

    it('keeps the data and does not migrate again when the file is opened twice', () => {
        const path = join(makeTempDir(), 'nested', 'anime.db');
        const first = new AnimeDb(path, () => {
            return NOW;
        });
        const anime = first.upsertAnime(NARUTO);
        first.ensureEpisode(anime.id, '1');
        first.close();

        const second = new AnimeDb(path);
        expect(second.schemaVersion).toBe(3);
        expect(second.list()).toEqual([
            {
                id: anime.id,
                title: 'Naruto',
                query: 'naruto',
                searchIndex: 1,
                audio: 'sub',
                createdAt: NOW,
                series: null,
                season: null,
                seasonName: null,
                episodes: [
                    {
                        id: 1,
                        animeId: anime.id,
                        number: '1',
                        status: 'queued',
                        filePath: null,
                        sizeBytes: null,
                        error: null,
                        positionSeconds: 0,
                        durationSeconds: 0,
                        watched: false,
                        downloadedAt: null,
                        fileMissing: false
                    }
                ]
            }
        ]);
        second.close();
    });

    it('rolls a failed migration back and reports the error', () => {
        const path = join(makeTempDir(), 'anime.db');
        const raw = new DatabaseSync(path);
        raw.exec('CREATE TABLE anime (leftover TEXT)');
        raw.close();

        expect(() => {
            return new AnimeDb(path);
        }).toThrow(/already exists/);

        const check = new DatabaseSync(path);
        expect(check.prepare('PRAGMA user_version').get()).toEqual({ user_version: 0 });
        expect(check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([{ name: 'anime' }]);
        check.close();
    });

    it('uses the default clock when none is given', () => {
        const db = new AnimeDb(':memory:');
        const before = Date.now();
        const anime = db.upsertAnime(NARUTO);
        expect(anime.createdAt).toBeGreaterThanOrEqual(before);
        expect(anime.createdAt).toBeLessThanOrEqual(Date.now());
    });
});

describe('AnimeDb.upsertAnime', () => {
    it('creates an anime', () => {
        expect(makeDb().upsertAnime(NARUTO)).toEqual({ id: 1, title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub', createdAt: NOW, series: null, season: null, seasonName: null });
    });

    it('treats the same title and audio as the same anime and refreshes its search data', () => {
        const db = makeDb();
        const first = db.upsertAnime(NARUTO);
        const second = db.upsertAnime({ ...NARUTO, query: 'naruto shippuden', searchIndex: 3 });
        expect(second).toEqual({ id: first.id, title: 'Naruto', query: 'naruto shippuden', searchIndex: 3, audio: 'sub', createdAt: NOW, series: null, season: null, seasonName: null });
        expect(db.list()).toHaveLength(1);
    });

    it('keeps the dubbed version apart', () => {
        const db = makeDb();
        const sub = db.upsertAnime(NARUTO);
        const dub = db.upsertAnime({ ...NARUTO, audio: 'dub' });
        expect(dub.id).not.toBe(sub.id);
        expect(dub.audio).toBe('dub');
    });
});

describe('AnimeDb.ensureEpisode', () => {
    it('queues a new episode', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        expect(db.ensureEpisode(anime.id, '1')).toMatchObject({ animeId: anime.id, number: '1', status: 'queued', error: null });
    });

    it('queues a failed or cancelled episode again and clears its error', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const failed = db.ensureEpisode(anime.id, '1');
        db.markFailed(failed.id, 'error', { code: 'NETWORK', raw: 'boom' });
        expect(db.ensureEpisode(anime.id, '1')).toMatchObject({ id: failed.id, status: 'queued', error: null });

        db.markFailed(failed.id, 'cancelled', null);
        expect(db.ensureEpisode(anime.id, '1').status).toBe('queued');
    });

    it('leaves a downloaded episode alone', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const episode = db.ensureEpisode(anime.id, '1');
        db.markDone(episode.id, '/a/1.mp4', 100);
        expect(db.ensureEpisode(anime.id, '1')).toMatchObject({ id: episode.id, status: 'done', filePath: '/a/1.mp4', sizeBytes: 100 });
    });
});

describe('AnimeDb lookups', () => {
    it('finds an anime, an episode and the anime with its episodes by id', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const episode = db.ensureEpisode(anime.id, '2');
        expect(db.getAnime(anime.id)).toEqual(anime);
        expect(db.getEpisode(episode.id)).toEqual(episode);
        expect(db.getLibraryAnime(anime.id)).toEqual({ ...anime, episodes: [episode] });
    });

    it('answers null for what does not exist', () => {
        const db = makeDb();
        expect(db.getAnime(99)).toBeNull();
        expect(db.getEpisode(99)).toBeNull();
        expect(db.getLibraryAnime(99)).toBeNull();
    });
});

describe('AnimeDb.list', () => {
    it('is empty at first', () => {
        expect(makeDb().list()).toEqual([]);
    });

    it('orders the animes by title, ignoring case, and the episodes by number', () => {
        const db = makeDb();
        const one = db.upsertAnime({ ...NARUTO, title: 'one piece' });
        const bleach = db.upsertAnime({ ...NARUTO, title: 'Bleach' });
        ['10', '2', '1', '1.5'].forEach((number) => {
            db.ensureEpisode(bleach.id, number);
        });
        const list = db.list();
        expect(
            list.map((anime) => {
                return anime.title;
            })
        ).toEqual(['Bleach', 'one piece']);
        expect(
            list[0]?.episodes.map((episode) => {
                return episode.number;
            })
        ).toEqual(['1', '1.5', '2', '10']);
        expect(list[1]?.id).toBe(one.id);
    });
});

describe('AnimeDb status changes', () => {
    it('marks an episode as downloading and clears the previous error', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const episode = db.ensureEpisode(anime.id, '1');
        db.markFailed(episode.id, 'error', { code: 'BLOCKED', raw: 'Blocked by cloudflare.' });
        db.markDownloading(episode.id);
        expect(db.getEpisode(episode.id)).toMatchObject({ status: 'downloading', error: null });
    });

    it('marks an episode as done with its file and size', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const episode = db.ensureEpisode(anime.id, '1');
        db.markDone(episode.id, '/a/Naruto Episode 1.mp4', 1234);
        expect(db.getEpisode(episode.id)).toMatchObject({
            status: 'done',
            filePath: '/a/Naruto Episode 1.mp4',
            sizeBytes: 1234,
            error: null,
            downloadedAt: NOW
        });
    });

    it('accepts an unknown size', () => {
        const db = makeDb();
        const episode = db.ensureEpisode(db.upsertAnime(NARUTO).id, '1');
        db.markDone(episode.id, '/a/1.mp4', null);
        expect(db.getEpisode(episode.id)?.sizeBytes).toBeNull();
    });

    it('records an error with its code and text', () => {
        const db = makeDb();
        const episode = db.ensureEpisode(db.upsertAnime(NARUTO).id, '1');
        db.markFailed(episode.id, 'error', { code: 'NO_SOURCES', raw: 'No sources found for sub!' });
        expect(db.getEpisode(episode.id)).toMatchObject({ status: 'error', error: { code: 'NO_SOURCES', raw: 'No sources found for sub!' } });
    });

    it('records a cancellation without an error', () => {
        const db = makeDb();
        const episode = db.ensureEpisode(db.upsertAnime(NARUTO).id, '1');
        db.markFailed(episode.id, 'cancelled', null);
        expect(db.getEpisode(episode.id)).toMatchObject({ status: 'cancelled', error: null });
    });

    it('reads an unrecognised stored error code and status as UNKNOWN and error', () => {
        const path = join(makeTempDir(), 'anime.db');
        const db = new AnimeDb(path);
        const episode = db.ensureEpisode(db.upsertAnime(NARUTO).id, '1');
        db.close();
        const raw = new DatabaseSync(path);
        raw.prepare('UPDATE episode SET status = ?, error_code = ?, error_raw = ? WHERE id = ?').run('mystery', 'FROM_THE_FUTURE', 'x', episode.id);
        raw.close();

        const reopened = new AnimeDb(path);
        expect(reopened.getEpisode(episode.id)).toMatchObject({ status: 'error', error: { code: 'UNKNOWN', raw: 'x' } });
        reopened.close();
    });
});

describe('AnimeDb.failInterrupted', () => {
    it('fails what was queued or downloading and leaves the rest', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const queued = db.ensureEpisode(anime.id, '1');
        const downloading = db.ensureEpisode(anime.id, '2');
        const done = db.ensureEpisode(anime.id, '3');
        const cancelled = db.ensureEpisode(anime.id, '4');
        db.markDownloading(downloading.id);
        db.markDone(done.id, '/a/3.mp4', 1);
        db.markFailed(cancelled.id, 'cancelled', null);

        db.failInterrupted();

        expect(db.getEpisode(queued.id)).toMatchObject({ status: 'error', error: { code: 'UNKNOWN', raw: INTERRUPTED_MESSAGE } });
        expect(db.getEpisode(downloading.id)).toMatchObject({ status: 'error', error: { code: 'UNKNOWN', raw: INTERRUPTED_MESSAGE } });
        expect(db.getEpisode(done.id)?.status).toBe('done');
        expect(db.getEpisode(cancelled.id)?.status).toBe('cancelled');
    });
});

describe('AnimeDb.saveProgress', () => {
    it('stores the position, the duration and whether it was watched', () => {
        const db = makeDb();
        const episode = db.ensureEpisode(db.upsertAnime(NARUTO).id, '1');
        db.saveProgress({ episodeId: episode.id, positionSeconds: 61.5, durationSeconds: 1440, watched: false });
        expect(db.getEpisode(episode.id)).toMatchObject({ positionSeconds: 61.5, durationSeconds: 1440, watched: false });

        db.saveProgress({ episodeId: episode.id, positionSeconds: 1430, durationSeconds: 1440, watched: true });
        expect(db.getEpisode(episode.id)).toMatchObject({ positionSeconds: 1430, durationSeconds: 1440, watched: true });
    });
});

describe('AnimeDb removal', () => {
    it('removes an episode and gives back its file', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const episode = db.ensureEpisode(anime.id, '1');
        db.markDone(episode.id, '/a/1.mp4', 1);
        expect(db.removeEpisode(episode.id)).toBe('/a/1.mp4');
        expect(db.getEpisode(episode.id)).toBeNull();
        expect(db.getAnime(anime.id)).not.toBeNull();
    });

    it('gives back null for an episode without a file or that does not exist', () => {
        const db = makeDb();
        const episode = db.ensureEpisode(db.upsertAnime(NARUTO).id, '1');
        expect(db.removeEpisode(episode.id)).toBeNull();
        expect(db.removeEpisode(99)).toBeNull();
    });

    it('removes an anime with its episodes and gives back the files of the downloaded ones', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const first = db.ensureEpisode(anime.id, '1');
        const second = db.ensureEpisode(anime.id, '2');
        db.ensureEpisode(anime.id, '3');
        db.markDone(first.id, '/a/1.mp4', 1);
        db.markDone(second.id, '/a/2.mp4', 1);

        expect(db.removeAnime(anime.id)).toEqual(['/a/1.mp4', '/a/2.mp4']);
        expect(db.getAnime(anime.id)).toBeNull();
        expect(db.getEpisode(first.id)).toBeNull();
        expect(db.list()).toEqual([]);
    });

    it('does not touch other animes', () => {
        const db = makeDb();
        const other = db.upsertAnime({ ...NARUTO, title: 'Bleach' });
        db.ensureEpisode(other.id, '1');
        const anime = db.upsertAnime(NARUTO);
        db.removeAnime(anime.id);
        expect(db.getLibraryAnime(other.id)?.episodes).toHaveLength(1);
    });
});

describe('AnimeDb importing what was found on the disk', () => {
    it('adds an anime, and keeps it as it is when it is already there', () => {
        const db = makeDb();
        const added = db.importAnime({ title: 'Naruto', query: 'naruto', searchIndex: 2, audio: 'sub' });
        expect(added).toEqual({ id: 1, title: 'Naruto', query: 'naruto', searchIndex: 2, audio: 'sub', createdAt: NOW, series: null, season: null, seasonName: null });
        expect(db.importAnime({ title: 'Naruto', query: 'other', searchIndex: 9, audio: 'sub' })).toEqual(added);
        expect(db.list()).toHaveLength(1);
    });

    it('fills in the search data that was not known', () => {
        const db = makeDb();
        db.importAnime({ title: 'Naruto', query: 'Naruto', searchIndex: 0, audio: 'sub' });
        expect(db.importAnime({ title: 'Naruto', query: 'naruto', searchIndex: 4, audio: 'sub' })).toMatchObject({ query: 'naruto', searchIndex: 4 });
        expect(db.importAnime({ title: 'Naruto', query: 'again', searchIndex: 7, audio: 'sub' })).toMatchObject({ query: 'naruto', searchIndex: 4 });
    });

    it('does not mix the audios of a title', () => {
        const db = makeDb();
        db.importAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub' });
        db.importAnime({ title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'dub' });
        expect(db.list()).toHaveLength(2);
    });

    it('finds an episode by its number', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const episode = db.ensureEpisode(anime.id, '1.5');
        expect(db.getEpisodeByNumber(anime.id, '1.5')).toEqual(episode);
        expect(db.getEpisodeByNumber(anime.id, '2')).toBeNull();
        expect(db.getEpisodeByNumber(99, '1.5')).toBeNull();
    });

    it('points an episode to another file, keeping the rest', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const episode = db.ensureEpisode(anime.id, '1');
        db.markDone(episode.id, '/old/a.mp4', 10);
        db.saveProgress({ episodeId: episode.id, positionSeconds: 5, durationSeconds: 100, watched: true });
        db.relinkEpisode(episode.id, '/new/a.mp4', 20);
        expect(db.getEpisode(episode.id)).toMatchObject({ status: 'done', filePath: '/new/a.mp4', sizeBytes: 20, positionSeconds: 5, watched: true, downloadedAt: NOW });
    });

    it('points several episodes to new files all together', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const first = db.ensureEpisode(anime.id, '1');
        const second = db.ensureEpisode(anime.id, '2');
        db.markDone(first.id, '/old/1.mp4', 10);
        db.markDone(second.id, '/old/2.mp4', 20);
        db.saveProgress({ episodeId: second.id, positionSeconds: 7, durationSeconds: 100, watched: true });

        db.relinkEpisodes([
            { episodeId: first.id, filePath: '/new/1.mp4', sizeBytes: 11 },
            { episodeId: second.id, filePath: '/new/2.mp4', sizeBytes: null }
        ]);

        expect(db.getEpisode(first.id)).toMatchObject({ status: 'done', filePath: '/new/1.mp4', sizeBytes: 11 });
        expect(db.getEpisode(second.id)).toMatchObject({ status: 'done', filePath: '/new/2.mp4', sizeBytes: null, positionSeconds: 7, watched: true });
    });

    it('changes none of the episodes when one of them cannot be pointed to a new file', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        const first = db.ensureEpisode(anime.id, '1');
        db.markDone(first.id, '/old/1.mp4', 10);

        expect(() => {
            db.relinkEpisodes([
                { episodeId: first.id, filePath: '/new/1.mp4', sizeBytes: 11 },
                { episodeId: 2, filePath: undefined as unknown as string, sizeBytes: 1 }
            ]);
        }).toThrow();

        expect(db.getEpisode(first.id)).toMatchObject({ filePath: '/old/1.mp4', sizeBytes: 10 });
        db.relinkEpisodes([{ episodeId: first.id, filePath: '/again/1.mp4', sizeBytes: 12 }]);
        expect(db.getEpisode(first.id)).toMatchObject({ filePath: '/again/1.mp4', sizeBytes: 12 });
    });

    it('does nothing when there is no episode to point', () => {
        const db = makeDb();
        expect(() => {
            db.relinkEpisodes([]);
        }).not.toThrow();
    });

    it('never says on its own that a file is missing', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        db.markDone(db.ensureEpisode(anime.id, '1').id, '/a.mp4', 1);
        expect(db.getEpisode(1)?.fileMissing).toBe(false);
    });
});

describe('AnimeDb series and seasons', () => {
    it('adds the columns by a migration that keeps what was there', () => {
        const dir = makeTempDir();
        const path = join(dir, 'anime.db');
        const old = new DatabaseSync(path);
        old.exec(
            `CREATE TABLE anime (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, query TEXT NOT NULL, search_index INTEGER NOT NULL, audio TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE (title, audio));
             CREATE TABLE episode (id INTEGER PRIMARY KEY AUTOINCREMENT, anime_id INTEGER NOT NULL REFERENCES anime (id) ON DELETE CASCADE, number TEXT NOT NULL, status TEXT NOT NULL, file_path TEXT, size_bytes INTEGER, error_code TEXT, error_raw TEXT, position_seconds REAL NOT NULL DEFAULT 0, duration_seconds REAL NOT NULL DEFAULT 0, watched INTEGER NOT NULL DEFAULT 0, downloaded_at INTEGER, UNIQUE (anime_id, number));
             INSERT INTO anime (title, query, search_index, audio, created_at) VALUES ('Naruto', 'naruto', 1, 'sub', 5);
             PRAGMA user_version = 1;`
        );
        old.close();

        const db = new AnimeDb(path, () => {
            return NOW;
        });
        expect(db.schemaVersion).toBe(3);
        expect(db.list()).toEqual([{ id: 1, title: 'Naruto', query: 'naruto', searchIndex: 1, audio: 'sub', createdAt: 5, series: null, season: null, seasonName: null, episodes: [] }]);
        db.close();
    });

    it('starts with no series', () => {
        expect(makeDb().upsertAnime(NARUTO)).toMatchObject({ series: null, season: null });
    });

    it('joins an anime to a series with a season, and takes it out again', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        expect(db.setSeries(anime.id, 'Naruto Series', 2)).toBe(true);
        expect(db.getAnime(anime.id)).toMatchObject({ series: 'Naruto Series', season: 2 });
        expect(db.setSeries(anime.id, null, null)).toBe(true);
        expect(db.getAnime(anime.id)).toMatchObject({ series: null, season: null });
    });

    it('keeps the series when the anime is saved again', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        db.setSeries(anime.id, 'Naruto Series', 2);
        db.upsertAnime({ ...NARUTO, query: 'naruto again' });
        expect(db.getAnime(anime.id)).toMatchObject({ query: 'naruto again', series: 'Naruto Series', season: 2 });
    });

    it('refuses a season that another anime of the series and audio has, whatever the case or the accents of the name', () => {
        const db = makeDb();
        const first = db.upsertAnime(NARUTO);
        const second = db.upsertAnime({ ...NARUTO, title: 'Naruto 2', searchIndex: 2 });
        db.setSeries(first.id, 'Pokémon', 1);
        expect(db.seasonTaken('pokemon', 1, 'sub', second.id)).toBe(true);
        expect(db.setSeries(second.id, 'POKEMON', 1)).toBe(false);
        expect(db.getAnime(second.id)).toMatchObject({ series: null, season: null });
        expect(db.setSeries(second.id, 'POKEMON', 2)).toBe(true);
    });

    it('allows the same season in another series, another audio, or the anime itself', () => {
        const db = makeDb();
        const sub = db.upsertAnime(NARUTO);
        const dub = db.upsertAnime({ ...NARUTO, audio: 'dub' });
        const other = db.upsertAnime({ ...NARUTO, title: 'Other', searchIndex: 3 });
        db.setSeries(sub.id, 'Series', 1);
        expect(db.setSeries(dub.id, 'Series', 1)).toBe(true);
        expect(db.setSeries(other.id, 'Another series', 1)).toBe(true);
        expect(db.setSeries(sub.id, 'Series', 1)).toBe(true);
        expect(db.seasonTaken('Series', 1, 'sub', sub.id)).toBe(false);
    });

    it('does nothing for an anime that is not there', () => {
        expect(makeDb().setSeries(99, 'Series', 1)).toBe(false);
    });

    it('finds an anime by its title and audio', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        expect(db.findAnime('Naruto', 'sub')).toEqual(anime);
        expect(db.findAnime('Naruto', 'dub')).toBeNull();
        expect(db.findAnime('Bleach', 'sub')).toBeNull();
    });

    it('does not replace a series when an anime is imported', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        db.setSeries(anime.id, 'Series', 3);
        expect(db.importAnime(NARUTO)).toMatchObject({ series: 'Series', season: 3 });
    });

    it('keeps one spelling for a series: the same name in another case, with other accents or extra spaces joins the one that is there', () => {
        const db = makeDb();
        const first = db.upsertAnime(NARUTO);
        const second = db.upsertAnime({ ...NARUTO, title: 'Naruto 2', searchIndex: 2 });
        const third = db.upsertAnime({ ...NARUTO, title: 'Naruto 3', searchIndex: 3 });
        db.setSeries(first.id, 'Pokémon Journeys', 1);
        db.setSeries(second.id, 'POKEMON   journeys', 2);
        db.setSeries(third.id, ' pokemon journeys ', 3);
        expect(
            db.list().map((anime) => {
                return [anime.series, anime.season];
            })
        ).toEqual([
            ['Pokémon Journeys', 1],
            ['Pokémon Journeys', 2],
            ['Pokémon Journeys', 3]
        ]);
    });

    it('lets the only anime of a series spell it differently', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        db.setSeries(anime.id, 'frieren', 1);
        db.setSeries(anime.id, 'Frieren', 1);
        expect(db.getAnime(anime.id)?.series).toBe('Frieren');
    });

    it('gives the spelling of the library for a name, or the name itself when it is new', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        db.setSeries(anime.id, 'Bleach', 1);
        expect(db.canonicalSeries('BLEACH')).toBe('Bleach');
        expect(db.canonicalSeries('Bleach', anime.id)).toBe('Bleach');
        expect(db.canonicalSeries('Frieren')).toBe('Frieren');
        expect(db.canonicalSeries('bleach', anime.id)).toBe('bleach');
    });

    it('keeps the name an anime is shown with in its series, and drops it with the series', () => {
        const db = makeDb();
        const anime = db.upsertAnime(NARUTO);
        expect(db.setSeries(anime.id, 'Bleach', 2, 'Thousand-Year Blood War')).toBe(true);
        expect(db.getAnime(anime.id)).toMatchObject({ series: 'Bleach', season: 2, seasonName: 'Thousand-Year Blood War' });
        expect(db.setSeries(anime.id, 'Bleach', 2)).toBe(true);
        expect(db.getAnime(anime.id)?.seasonName).toBeNull();
        db.setSeries(anime.id, 'Bleach', 3, 'Arc');
        db.setSeries(anime.id, null, null, 'Ignored');
        expect(db.getAnime(anime.id)).toMatchObject({ series: null, season: null, seasonName: null });
    });

    it('does not use the name to tell the anime of a series apart: only the order counts', () => {
        const db = makeDb();
        const first = db.upsertAnime(NARUTO);
        const second = db.upsertAnime({ ...NARUTO, title: 'Naruto 2', searchIndex: 2 });
        db.setSeries(first.id, 'Naruto', 1, 'Same name');
        expect(db.setSeries(second.id, 'Naruto', 2, 'Same name')).toBe(true);
        expect(db.setSeries(second.id, 'Naruto', 1, 'Other name')).toBe(false);
    });

    it('adds the column of the name by a migration that keeps what was there', () => {
        const dir = makeTempDir();
        const path = join(dir, 'anime.db');
        const first = new AnimeDb(path, () => {
            return NOW;
        });
        const anime = first.upsertAnime(NARUTO);
        first.setSeries(anime.id, 'Series', 2);
        first.close();
        const raw = new DatabaseSync(path);
        raw.exec('ALTER TABLE anime DROP COLUMN season_name; PRAGMA user_version = 2;');
        raw.close();

        const db = new AnimeDb(path);
        expect(db.schemaVersion).toBe(3);
        expect(db.getAnime(anime.id)).toMatchObject({ series: 'Series', season: 2, seasonName: null });
        db.close();
    });
});
