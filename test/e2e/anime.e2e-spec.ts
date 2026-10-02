import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const ELECTRON_PATH = createRequire(__filename)('electron') as unknown as string;
const FAKE_ANI_CLI = resolve(__dirname, 'fixtures/fake-ani-cli.sh');
const EXE = process.platform === 'win32' ? '.exe' : '';
const HAS_ANI_TOOLS = [`busybox${EXE}`, `curl${EXE}`, 'ani-cli'].every((name) => {
    return existsSync(join(ROOT, 'resources', 'bin', 'ani', name));
});

interface Session {
    app: ElectronApplication;
    page: Page;
    userData: string;
    animeDir: string;
    callsLog: string;
}

let session: Session;
let workDir: string;

async function launch(userData: string, settings: Record<string, unknown> = {}): Promise<Session> {
    const animeDir = join(workDir, 'anime');
    mkdirSync(userData, { recursive: true });
    writeFileSync(
        join(userData, 'settings.json'),
        JSON.stringify({ language: 'en', checkUpdatesOnStart: false, downloadDir: join(workDir, 'downloads'), animeDownloadDir: animeDir, animeQuality: '720p', ...settings })
    );
    const app = await electron.launch({
        executablePath: ELECTRON_PATH,
        args: [ROOT, '--no-sandbox', `--user-data-dir=${userData}`],
        // The folder the library is rebuilt from is not asked for: there is no way to answer a dialog of the system here.
        env: { ...process.env, PULLWAVE_ANI_CLI: FAKE_ANI_CLI, PULLWAVE_IMPORT_DIR: animeDir }
    });
    const page = await app.firstWindow();
    await page.waitForSelector('.logo');
    // The screens only show up once yt-dlp and ffmpeg were probed, which can take a while the first time on Windows.
    await expect(page.getByText('// BOOTING SYSTEMS…')).toBeHidden({ timeout: 60000 });
    return { app, page, userData, animeDir, callsLog: join(userData, 'anime', 'history', 'calls.log') };
}

function calls(): string[] {
    return readFileSync(session.callsLog, 'utf-8').split('\n').filter((line) => {
        return line.length > 0;
    });
}

async function openAnimeTab(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'ANIME', exact: true }).click();
}

async function showDownloads(page: Page): Promise<void> {
    await page.getByRole('button', { name: /^DOWNLOADS \(\d+\)$/ }).click();
}

async function backFromDownloads(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'BACK' }).click();
}

// The downloads are on a screen of their own: open it, wait for them to finish and go back to where we were.
async function waitForDownloaded(page: Page, count = 1): Promise<void> {
    await showDownloads(page);
    await expect(page.locator('.job .badge--done')).toHaveCount(count);
    await backFromDownloads(page);
}

async function search(page: Page, query: string): Promise<void> {
    await page.getByLabel('Anime name').fill(query);
    await page.getByLabel('Anime name').press('Enter');
}

async function openFirstResult(page: Page): Promise<void> {
    await search(page, 'fake');
    await page.getByRole('button', { name: 'OPEN: Fake Anime', exact: true }).click();
    await expect(page.getByRole('button', { name: 'EP 3', exact: true })).toBeVisible();
}

test.skip(!['linux', 'win32'].includes(process.platform) || !HAS_ANI_TOOLS, 'the anime section exists on Linux and Windows and needs `npm run fetch-binaries`');

test.beforeEach(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'pullwave-anime-e2e-'));
    session = await launch(join(workDir, 'user-data'));
});

test.afterEach(async () => {
    await session.app.close();
    rmSync(workDir, { recursive: true, force: true });
});

test('adds the anime tab and opens its search', async () => {
    const { page } = session;
    await expect(page.getByRole('navigation', { name: 'Sections' }).getByRole('button')).toHaveText(['DOWNLOADS', 'ANIME', 'HISTORY', 'SETTINGS']);
    await openAnimeTab(page);
    await expect(page.getByRole('button', { name: 'ANIME', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByLabel('Anime name')).toBeVisible();
    await expect(page.getByLabel('Audio')).toHaveValue('sub');
});

test('searches an anime, lists the results and reports when nothing is found', async () => {
    const { page } = session;
    await openAnimeTab(page);
    await search(page, 'fake');
    await expect(page.getByText('2 RESULTS')).toBeVisible();
    await expect(page.locator('.history__title')).toHaveText(['Fake Anime', 'Fake Anime 2']);
    expect(calls()).toEqual(['sub | fake']);

    await search(page, 'zzz');
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('Nothing was found for this search.');
    await expect(alert).toHaveAttribute('title', 'No results found!');
});

test('searches with the audio that was picked', async () => {
    const { page } = session;
    await openAnimeTab(page);
    await page.getByLabel('Audio').selectOption('dub');
    await search(page, 'fake');
    await expect(page.getByText('2 RESULTS')).toBeVisible();
    expect(calls()).toEqual(['dub | fake']);
});

test('opens an anime and lists its episodes', async () => {
    const { page } = session;
    await openAnimeTab(page);
    await openFirstResult(page);
    await expect(page.getByText('3 EPISODES', { exact: true })).toBeVisible();
    await expect(page.locator('.episode-chip')).toHaveText(['EP 1', 'EP 2', 'EP 3']);
    expect(calls()).toEqual(['sub | fake', 'sub | -S 1 fake']);
    await page.getByRole('button', { name: 'BACK' }).click();
    await expect(page.getByText('2 RESULTS')).toBeVisible();
});

test('shows the confirmation of a download and takes it away by itself after three seconds', async () => {
    const { page } = session;
    await openAnimeTab(page);
    await openFirstResult(page);
    await page.getByRole('button', { name: 'EP 2', exact: true }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();

    const notice = page.getByText('Queued 1 episode(s) of Fake Anime.');
    await expect(notice).toBeVisible();
    await expect(notice).toBeHidden({ timeout: 6000 });
});

test('downloads an episode with the quality of the settings and shows it in the library', async () => {
    const { page, animeDir } = session;
    await openAnimeTab(page);
    await openFirstResult(page);
    await page.getByRole('button', { name: 'EP 2', exact: true }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();

    await expect(page.getByText('Queued 1 episode(s) of Fake Anime.')).toBeVisible();
    await showDownloads(page);
    await expect(page.getByTestId('anime-job').locator('.badge--done')).toHaveText('DOWNLOADED');
    await expect(page.getByTestId('anime-job').getByRole('heading')).toHaveText('Fake Anime · EP 2');
    await backFromDownloads(page);
    expect(calls().at(-1)).toBe('sub | -d -S 1 -e 2 -q 720p fake');

    const video = join(animeDir, 'Fake Anime', 'Episode 2', 'Fake Anime Episode 2.mp4');
    expect(readFileSync(video, 'utf-8')).toBe('FAKEVIDEO0123456789');
    expect(readFileSync(join(animeDir, 'Fake Anime', 'Episode 2', 'Fake Anime Episode 2.vtt'), 'utf-8')).toBe('WEBVTT\n');

    await page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
    const card = page.getByTestId('anime-card');
    await expect(card.getByRole('heading')).toHaveText('Fake Anime');
    await expect(card.getByText('1/1 DOWNLOADED')).toBeVisible();
    await card.getByRole('button', { name: 'SHOW EPISODES' }).click();
    await expect(page.getByTestId('anime-episode').locator('.history__meta').first()).toHaveText('DOWNLOADED · 19 B');
});

test('downloads a whole season, as many at a time as the settings allow', async () => {
    const { page, animeDir } = session;
    await openAnimeTab(page);
    await openFirstResult(page);
    await page.getByRole('button', { name: 'SELECT ALL' }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (3)' }).click();

    await showDownloads(page);
    await expect(page.getByTestId('anime-job')).toHaveCount(3);
    await expect(page.locator('.job .badge--done')).toHaveCount(3);
    await backFromDownloads(page);
    ['1', '2', '3'].forEach((number) => {
        expect(existsSync(join(animeDir, 'Fake Anime', `Episode ${number}`, `Fake Anime Episode ${number}.mp4`))).toBe(true);
    });
    expect(
        calls()
            .filter((line) => {
                return line.includes('-d ');
            })
            .sort()
    ).toEqual(['sub | -d -S 1 -e 1 -q 720p fake', 'sub | -d -S 1 -e 2 -q 720p fake', 'sub | -d -S 1 -e 3 -q 720p fake']);
});

test('asks for the subtitles in the language of the app, and in another one when chosen', async () => {
    const { page, userData } = session;
    await openAnimeTab(page);
    await openFirstResult(page);
    await page.getByRole('button', { name: 'EP 1', exact: true }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();
    await waitForDownloaded(page);
    const labels = (): string[] => {
        return readFileSync(join(userData, 'anime', 'history', 'subtitle-labels.log'), 'utf-8').split('\n').filter((line) => {
            return line.length > 0;
        });
    };
    // The app is in English: English, nothing else to fall back to.
    expect(labels().at(-1)).toBe('English');

    await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
    await page.getByLabel('Anime subtitles').selectOption('Spanish');
    await expect.poll(() => {
        return (JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf-8')) as Record<string, unknown>).animeSubtitles;
    }).toBe('Spanish');
    await openAnimeTab(page);
    await page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
    await page.getByRole('button', { name: 'REMOVE ANIME: Fake Anime' }).click();
    await page.getByRole('button', { name: 'CONFIRM' }).click();
    await page.getByRole('button', { name: 'SEARCH', exact: true }).first().click();
    // The anime that was open is still open: go back to the results to search again.
    await page.getByRole('button', { name: 'BACK' }).click();
    await openFirstResult(page);
    await page.getByRole('button', { name: 'EP 1', exact: true }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();
    await expect.poll(() => {
        return labels().at(-1);
    }).toBe('Spanish');
});

test('shows the downloads on a screen of their own, with their number on a button, and goes back', async () => {
    const { page } = session;
    await openAnimeTab(page);
    await expect(page.getByRole('button', { name: 'DOWNLOADS (0)' })).toBeVisible();
    await openFirstResult(page);
    await page.getByRole('button', { name: 'SELECT ALL' }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (3)' }).click();

    await showDownloads(page);
    await expect(page.getByTestId('anime-job')).toHaveCount(3);
    await expect(page.getByLabel('Anime name')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Anime' })).toHaveCount(0);
    await expect(page.locator('.job .badge--done')).toHaveCount(3);
    await backFromDownloads(page);

    // Back where it was: the episodes of the anime that was open, with nothing finished left counted.
    await expect(page.getByRole('button', { name: 'EP 3', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'DOWNLOADS (0)' })).toBeVisible();
    await page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
    await showDownloads(page);
    await backFromDownloads(page);
    await expect(page.getByTestId('anime-card')).toBeVisible();
});

test('cancelling a download ends the process: the file is never finished', async () => {
    const { page, animeDir } = session;
    await openAnimeTab(page);
    await search(page, 'slow');
    await page.getByRole('button', { name: 'OPEN: Fake Anime', exact: true }).click();
    await page.getByRole('button', { name: 'EP 1', exact: true }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();

    await showDownloads(page);
    const job = page.getByTestId('anime-job');
    await expect(job.locator('.badge--running')).toHaveText('DOWNLOADING');
    await expect(job.getByText('25.0%')).toBeVisible();
    await job.getByRole('button', { name: 'CANCEL' }).click();
    await expect(job.locator('.badge--cancelled')).toHaveText('CANCELLED');

    // The fake would have written the file five seconds after it started: it must not, because nothing is left running.
    await page.waitForTimeout(7000);
    expect(existsSync(join(animeDir, 'Fake Anime', 'Episode 1', 'Fake Anime Episode 1.mp4'))).toBe(false);
    await expect(job.locator('.badge--cancelled')).toBeVisible();
    await backFromDownloads(page);
    await page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
    await page.getByRole('button', { name: 'SHOW EPISODES' }).click();
    await expect(page.getByTestId('anime-episode').locator('.history__meta').first()).toHaveText('CANCELLED');
});

test('shows why a download failed and retries it', async () => {
    const { page } = session;
    await openAnimeTab(page);
    await search(page, 'fail');
    await page.getByRole('button', { name: 'OPEN: Fake Anime', exact: true }).click();
    await page.getByRole('button', { name: 'EP 1', exact: true }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();

    await showDownloads(page);
    const job = page.getByTestId('anime-job');
    await expect(job.locator('.badge--error')).toHaveText('FAILED');
    const reason = job.getByRole('alert');
    await expect(reason).toHaveText('No video source was found for this episode.');
    await expect(reason).toHaveAttribute('title', 'No sources found for sub!');

    await job.getByRole('button', { name: 'RETRY' }).click();
    await expect(job.locator('.badge--error')).toHaveText('FAILED');
    expect(
        calls().filter((line) => {
            return line.includes('-d ');
        })
    ).toHaveLength(2);
});

test('keeps the library after the app is restarted', async () => {
    const { page, userData } = session;
    await openAnimeTab(page);
    await openFirstResult(page);
    await page.getByRole('button', { name: 'EP 1', exact: true }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();
    await waitForDownloaded(page);
    await session.app.close();

    session = await launch(userData);
    await openAnimeTab(session.page);
    await session.page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
    await expect(session.page.getByTestId('anime-card').getByText('1/1 DOWNLOADED')).toBeVisible();
    await showDownloads(session.page);
    await expect(session.page.getByTestId('anime-job')).toHaveCount(0);
    await expect(session.page.getByText('// NO DOWNLOADS YET.')).toBeVisible();
});

test.describe('player', () => {
    async function downloadEpisode(page: Page): Promise<void> {
        await openAnimeTab(page);
        await openFirstResult(page);
        await page.getByRole('button', { name: 'EP 1', exact: true }).click();
        await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();
        await waitForDownloaded(page);
    }

    interface MediaAnswer {
        status: number;
        headers: Record<string, string>;
        body: string;
    }

    // Asked from the main process: the page itself is not allowed to fetch() this scheme (its CSP only lets media through).
    async function request(url: string, range?: string): Promise<MediaAnswer> {
        return session.app.evaluate(
            async ({ net }, [target, header]) => {
                const response = await net.fetch(target as string, header ? { headers: { Range: header } } : undefined);
                const headers: Record<string, string> = {};
                response.headers.forEach((value, key) => {
                    headers[key] = value;
                });
                return { status: response.status, headers, body: await response.text() };
            },
            [url, range ?? ''] as const
        );
    }

    test('serves the whole file, the part that is asked for and the subtitles', async () => {
        const { page } = session;
        await downloadEpisode(page);

        const whole = await request('pullwave-media://episode/1');
        expect(whole.status).toBe(200);
        expect(whole.headers).toMatchObject({ 'content-type': 'video/mp4', 'content-length': '19', 'accept-ranges': 'bytes' });
        expect(whole.body).toBe('FAKEVIDEO0123456789');

        const part = await request('pullwave-media://episode/1', 'bytes=9-13');
        expect(part.status).toBe(206);
        expect(part.headers).toMatchObject({ 'content-type': 'video/mp4', 'content-length': '5', 'content-range': 'bytes 9-13/19', 'accept-ranges': 'bytes' });
        expect(part.body).toBe('01234');

        const subtitles = await request('pullwave-media://subtitle/1');
        expect(subtitles.status).toBe(200);
        expect(subtitles.headers['content-type']).toBe('text/vtt; charset=utf-8');
        expect(subtitles.body).toBe('WEBVTT\n');
    });

    test('refuses a range past the end and what is not in the library', async () => {
        const { page } = session;
        await downloadEpisode(page);

        const past = await request('pullwave-media://episode/1', 'bytes=500-600');
        expect(past.status).toBe(416);
        expect(past.headers['content-range']).toBe('bytes */19');

        const unknown = await request('pullwave-media://episode/99');
        expect(unknown.status).toBe(404);
        expect(unknown.body).toBe('');
        expect((await request('pullwave-media://episode/abc')).status).toBe(404);
    });

    test('opens the video of a downloaded episode in a dialog and closes it', async () => {
        const { page } = session;
        await downloadEpisode(page);
        await page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
        await page.getByRole('button', { name: 'SHOW EPISODES' }).click();
        await page.getByRole('button', { name: 'PLAY: Fake Anime EP 1' }).click();

        const dialog = page.getByRole('dialog', { name: 'Fake Anime · EP 1' });
        await expect(dialog).toBeVisible();
        await expect(dialog.locator('video')).toHaveAttribute('src', 'pullwave-media://episode/1');
        // The control bar is the app's own, not the browser's, so it follows the theme.
        await expect(dialog.locator('video')).not.toHaveAttribute('controls');
        await expect(dialog.locator('.player__controls')).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Play' })).toBeVisible();
        await expect(dialog.getByRole('slider', { name: 'Seek' })).toBeVisible();
        await expect(dialog.getByRole('slider', { name: 'Volume' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Fullscreen' })).toBeVisible();
        // The fake file is not a real video: the player says so instead of staying blank.
        await expect(dialog.getByRole('alert')).toHaveText('This video could not be played. Its format may not be supported by the app.');

        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
    });
});

async function downloadFirstEpisode(page: Page): Promise<void> {
    await openAnimeTab(page);
    await openFirstResult(page);
    await page.getByRole('button', { name: 'EP 1', exact: true }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();
    await waitForDownloaded(page);
}

test('removes an episode and always deletes its files from the disk', async () => {
    const { page, animeDir } = session;
    await downloadFirstEpisode(page);
    const video = join(animeDir, 'Fake Anime', 'Episode 1', 'Fake Anime Episode 1.mp4');
    expect(existsSync(video)).toBe(true);

    await page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
    await page.getByRole('button', { name: 'SHOW EPISODES' }).click();
    await page.getByRole('button', { name: 'REMOVE: Fake Anime EP 1' }).click();
    await expect(page.getByText('The files are deleted from the disk too.')).toBeVisible();
    await expect(page.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('button', { name: 'CONFIRM' }).click();

    await expect(page.getByTestId('anime-episode')).toHaveCount(0);
    await expect.poll(() => {
        return existsSync(video);
    }).toBe(false);
    expect(existsSync(join(animeDir, 'Fake Anime', 'Episode 1', 'Fake Anime Episode 1.vtt'))).toBe(false);
    // The folder of the episode goes with it.
    await expect.poll(() => {
        return existsSync(join(animeDir, 'Fake Anime', 'Episode 1'));
    }).toBe(false);
    // The anime itself stays in the library; only its folder is removed with the anime.
    expect(existsSync(join(animeDir, 'Fake Anime'))).toBe(true);
});

test('removes an anime with its files and its folder', async () => {
    const { page, animeDir } = session;
    await downloadFirstEpisode(page);
    writeFileSync(join(animeDir, 'Fake Anime', 'leftover.part'), 'x');
    expect(existsSync(join(animeDir, 'Fake Anime'))).toBe(true);

    await page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
    await page.getByRole('button', { name: 'REMOVE ANIME: Fake Anime' }).click();
    await page.getByRole('button', { name: 'CONFIRM' }).click();

    await expect(page.getByText('// THE LIBRARY IS EMPTY. SEARCH AN ANIME AND DOWNLOAD AN EPISODE.')).toBeVisible();
    await expect.poll(() => {
        return existsSync(join(animeDir, 'Fake Anime'));
    }).toBe(false);
    // What is outside the folder of the anime is left alone.
    expect(existsSync(animeDir)).toBe(true);
});

test.describe('library and folder in sync', () => {
    async function openLibrary(page: Page): Promise<void> {
        await openAnimeTab(page);
        await page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
    }

    test('rebuilds the library from the folder when the library was lost, with the metadata next to the video', async () => {
        const { page, userData, animeDir } = session;
        await downloadFirstEpisode(page);
        const metadata = join(animeDir, 'Fake Anime', 'Episode 1', 'pullwave.json');
        expect(JSON.parse(readFileSync(metadata, 'utf-8'))).toEqual({
            version: 1,
            title: 'Fake Anime',
            query: 'fake',
            searchIndex: 1,
            audio: 'sub',
            number: '1',
            positionSeconds: 0,
            durationSeconds: 0,
            watched: false
        });
        await session.app.close();
        rmSync(join(userData, 'anime', 'anime.db'), { force: true });

        session = await launch(userData);
        await openLibrary(session.page);
        await expect(session.page.getByText('// THE LIBRARY IS EMPTY. SEARCH AN ANIME AND DOWNLOAD AN EPISODE.')).toBeVisible();
        await session.page.getByRole('button', { name: 'IMPORT LIBRARY' }).click();

        await expect(session.page.locator('.toast__message')).toHaveText('IMPORT DONE: 1 ADDED · 0 POINTED TO A NEW PLACE · 0 ALREADY IN THE LIBRARY · 0 NOT RECOGNIZED');
        const card = session.page.getByTestId('anime-card');
        await expect(card.getByRole('heading')).toHaveText('Fake Anime');
        await expect(card.getByText('1/1 DOWNLOADED')).toBeVisible();

        // The second time everything is already there.
        await session.page.getByRole('button', { name: 'IMPORT LIBRARY' }).click();
        await expect(session.page.locator('.toast__message')).toHaveText('IMPORT DONE: 0 ADDED · 0 POINTED TO A NEW PLACE · 1 ALREADY IN THE LIBRARY · 0 NOT RECOGNIZED');
        await expect(session.page.getByTestId('anime-card')).toHaveCount(1);
    });

    test('marks an episode whose file is gone, and the import fixes it when the folder was renamed', async () => {
        const { page, animeDir } = session;
        await downloadFirstEpisode(page);
        await openLibrary(page);
        await page.getByRole('button', { name: 'SHOW EPISODES' }).click();
        await expect(page.getByRole('img', { name: 'FILE NOT FOUND' })).toHaveCount(0);

        renameSync(join(animeDir, 'Fake Anime'), join(animeDir, 'My Renamed Folder'));
        // The library looks at the disk when it is shown.
        await page.locator('.tab', { hasText: 'SEARCH' }).click();
        await page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
        await page.getByRole('button', { name: 'SHOW EPISODES' }).click();
        await expect(page.getByRole('img', { name: 'FILE NOT FOUND' })).toHaveCount(1);
        await expect(page.getByRole('button', { name: 'PLAY: Fake Anime EP 1' })).toBeDisabled();

        await page.getByRole('button', { name: 'IMPORT LIBRARY' }).click();
        await expect(page.locator('.toast__message')).toHaveText('IMPORT DONE: 0 ADDED · 1 POINTED TO A NEW PLACE · 0 ALREADY IN THE LIBRARY · 0 NOT RECOGNIZED');
        await expect(page.getByTestId('anime-card')).toHaveCount(1);
        await expect(page.getByRole('img', { name: 'FILE NOT FOUND' })).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'PLAY: Fake Anime EP 1' })).toBeEnabled();
    });

    test('shows the mark and disables the player for an episode whose file was removed from the disk', async () => {
        const { page, animeDir } = session;
        await downloadFirstEpisode(page);
        rmSync(join(animeDir, 'Fake Anime', 'Episode 1', 'Fake Anime Episode 1.mp4'));

        await openLibrary(page);
        await page.getByRole('button', { name: 'SHOW EPISODES' }).click();
        const row = page.getByTestId('anime-episode');
        await expect(row.getByRole('img', { name: 'FILE NOT FOUND' })).toHaveAttribute(
            'title',
            'The file of this episode is not on the disk. Use IMPORT LIBRARY to point it to its new place.'
        );
        await expect(row.getByRole('button', { name: 'PLAY: Fake Anime EP 1' })).toBeDisabled();
    });

    test('downloads a new episode into the folder the anime was renamed to, once the library knows about it', async () => {
        const { page, animeDir } = session;
        await downloadFirstEpisode(page);
        renameSync(join(animeDir, 'Fake Anime'), join(animeDir, 'My Renamed Folder'));
        await openLibrary(page);
        await page.getByRole('button', { name: 'IMPORT LIBRARY' }).click();
        await expect(page.locator('.toast__message')).toHaveText('IMPORT DONE: 0 ADDED · 1 POINTED TO A NEW PLACE · 0 ALREADY IN THE LIBRARY · 0 NOT RECOGNIZED');
        await page.getByRole('button', { name: 'SEARCH', exact: true }).first().click();

        // The anime is still open after the first download.
        await page.getByRole('button', { name: 'EP 2', exact: true }).click();
        await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();
        await waitForDownloaded(page, 2);

        expect(existsSync(join(animeDir, 'My Renamed Folder', 'Episode 2', 'Fake Anime Episode 2.mp4'))).toBe(true);
        expect(existsSync(join(animeDir, 'Fake Anime'))).toBe(false);
    });
});

test('shows the version of ani-cli at the top and in the settings, and does not update a script that was chosen', async () => {
    const { page } = session;
    const chip = page.locator('.chip', { hasText: 'ani-cli' });
    await expect(chip).toHaveText('ani-cli 0.0.0-fake');
    await expect(chip).toHaveClass(/chip--ok/);
    await expect(chip).toHaveAttribute('title', `${FAKE_ANI_CLI} (custom)`);

    await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
    await expect(page.getByText('ani-cli version: 0.0.0-fake')).toBeVisible();
    await page.getByRole('button', { name: 'UPDATE ANI-CLI' }).click();
    await expect(page.locator('.toast--error .toast__message')).toHaveText('You chose your own ani-cli in the settings, so the app does not update it.');
    await expect(page.getByRole('button', { name: 'UPDATE ANI-CLI' })).toBeEnabled();
    await expect(chip).toHaveText('ani-cli 0.0.0-fake');
});

test('shows the anime settings and saves them', async () => {
    const { page, userData } = session;
    await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
    await expect(page.locator('.settings legend', { hasText: /^ANIME$/ })).toBeVisible();
    await expect(page.getByLabel('Anime quality')).toHaveValue('720p');
    await page.getByLabel('Anime quality').selectOption('worst');
    await page.getByLabel('Anime audio').selectOption('dub');
    await expect.poll(() => {
        const saved = JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf-8')) as Record<string, unknown>;
        return [saved.animeQuality, saved.animeAudio];
    }).toEqual(['worst', 'dub']);
});

test.describe('watching without downloading', () => {
    const REFERER = 'https://embed.example/';
    const FFMPEG = join(ROOT, 'resources', 'bin', `ffmpeg${EXE}`);
    test.skip(!existsSync(FFMPEG), 'needs the bundled ffmpeg to make a video: run `npm run fetch-binaries`');

    interface Seen {
        path: string;
        referer: string | undefined;
        origin: string | undefined;
        userAgent: string | undefined;
    }

    let hlsDir: string;
    let server: Server;
    let baseUrl: string;
    let seen: Seen[];

    test.beforeAll(async () => {
        hlsDir = mkdtempSync(join(tmpdir(), 'pullwave-hls-'));
        execFileSync(
            FFMPEG,
            ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=8:size=160x120:rate=10', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-force_key_frames', 'expr:gte(t,n_forced*2)', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod', '-hls_segment_filename', join(hlsDir, 'seg%d.ts'), join(hlsDir, 'index.m3u8')]
        );
        writeFileSync(join(hlsDir, 'en.vtt'), 'WEBVTT\n\n00:00.000 --> 00:08.000\nHello from the stream\n');
        seen = [];
        server = createServer((request, response) => {
            const path = (request.url ?? '/').split('?')[0] ?? '/';
            seen.push({ path, referer: request.headers.referer, origin: request.headers.origin, userAgent: request.headers['user-agent'] });
            // Like the real host: only the site that embeds the player may ask.
            const file = join(hlsDir, path.replace(/^\//, ''));
            if (request.headers.referer !== REFERER || !existsSync(file)) {
                response.writeHead(request.headers.referer !== REFERER ? 403 : 404).end();
                return;
            }
            const types: Record<string, string> = { '.m3u8': 'application/vnd.apple.mpegurl', '.ts': 'video/mp2t', '.vtt': 'text/vtt' };
            const extension = path.slice(path.lastIndexOf('.'));
            response.writeHead(200, { 'Content-Type': types[extension] ?? 'application/octet-stream' }).end(readFileSync(file));
        });
        await new Promise<void>((resolveListening) => {
            server.listen(0, '127.0.0.1', resolveListening);
        });
        baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    test.afterAll(async () => {
        await new Promise<void>((resolveClosed) => {
            server.close(() => {
                resolveClosed();
            });
        });
        rmSync(hlsDir, { recursive: true, force: true });
    });

    test.beforeEach(() => {
        seen.length = 0;
        const history = join(session.userData, 'anime', 'history');
        mkdirSync(history, { recursive: true });
        writeFileSync(join(history, 'stream-url'), `${baseUrl}/index.m3u8`);
        writeFileSync(join(history, 'stream-subtitles'), `${baseUrl}/en.vtt`);
    });

    async function watchEpisode(page: Page, episode: string): Promise<void> {
        await openAnimeTab(page);
        await openFirstResult(page);
        await page.getByRole('button', { name: `EP ${episode}`, exact: true }).click();
        await page.getByRole('button', { name: 'WATCH', exact: true }).click();
    }

    test('plays the episode without downloading it, through the app', async () => {
        const { page, animeDir, userData } = session;
        await watchEpisode(page, '2');

        const dialog = page.getByRole('dialog', { name: 'Fake Anime · EP 2' });
        await expect(dialog).toBeVisible();
        await expect.poll(async () => {
            return dialog.locator('video').evaluate((video: HTMLVideoElement) => {
                return video.readyState >= 3 ? video.duration : 0;
            });
        }, { timeout: 20000 }).toBeGreaterThan(7);

        const played = await dialog.locator('video').evaluate(async (video: HTMLVideoElement) => {
            await new Promise((resolveWaiting) => {
                setTimeout(resolveWaiting, 1500);
            });
            return { time: video.currentTime, width: video.videoWidth, height: video.videoHeight, error: video.error?.code ?? null, tracks: video.textTracks.length };
        });
        expect(played.time).toBeGreaterThan(0.5);
        expect(played).toMatchObject({ width: 160, height: 120, error: null, tracks: 1 });

        // Every request of the player reached the host as the site that embeds it, never as the app.
        expect(seen.length).toBeGreaterThan(2);
        seen.forEach((request) => {
            expect(request.referer).toBe(REFERER);
            expect(request.origin).toBe('https://embed.example');
            expect(request.userAgent).toContain('Chrome/124.0.0.0');
        });
        expect(seen.map((request) => {
            return request.path;
        })).toEqual(expect.arrayContaining(['/index.m3u8', '/seg0.ts', '/en.vtt']));

        // ani-cli was only asked for the address (debug player, no -d) and nothing was saved.
        expect(readFileSync(join(userData, 'anime', 'history', 'calls.log'), 'utf-8').trim().split('\n').at(-1)).toBe('sub | -S 1 -e 2 -q 720p fake');
        expect(readFileSync(join(userData, 'anime', 'history', 'players.log'), 'utf-8').trim().split('\n').at(-1)).toBe('debug');
        expect(existsSync(animeDir) ? readdirSync(animeDir) : []).toEqual([]);
    });

    test('seeks in the episode', async () => {
        const { page } = session;
        await watchEpisode(page, '1');
        const video = page.getByRole('dialog').locator('video');
        await expect.poll(async () => {
            return video.evaluate((element: HTMLVideoElement) => {
                return element.readyState;
            });
        }, { timeout: 20000 }).toBeGreaterThanOrEqual(3);

        await expect(page.getByRole('dialog').getByRole('slider', { name: 'Seek' })).toBeVisible();
        await page.getByRole('dialog').getByRole('slider', { name: 'Seek' }).fill('5');
        await expect.poll(() => {
            return seen.some((request) => {
                return request.path === '/seg2.ts' || request.path === '/seg3.ts';
            });
        }).toBe(true);
        await expect.poll(async () => {
            return video.evaluate((element: HTMLVideoElement) => {
                return element.currentTime;
            });
        }).toBeGreaterThan(5);
    });

    test('closes with Escape and the stream is no longer served', async () => {
        const { page, app } = session;
        const answer = async (url: string): Promise<{ status: number; type: string | null; body: string }> => {
            return app.evaluate(async ({ net }, target) => {
                const response = await net.fetch(target);
                return { status: response.status, type: response.headers.get('content-type'), body: await response.text() };
            }, url);
        };
        await openAnimeTab(page);
        await openFirstResult(page);
        const opened = await page.evaluate(() => {
            return window.api.openAnimeStream({ query: 'fake', index: 1, audio: 'sub', episode: '1' });
        });
        expect(opened.ok).toBe(true);
        if (!opened.ok) {
            return;
        }

        const playlist = await answer(opened.stream.url);
        expect(playlist.status).toBe(200);
        expect(playlist.type).toBe('application/vnd.apple.mpegurl');
        expect(playlist.body).toContain('#EXTM3U');
        expect(playlist.body).toContain('pullwave-stream://p/');
        expect(playlist.body).not.toContain('seg0.ts\n');
        expect(opened.stream.subtitleUrl).toMatch(/^pullwave-stream:\/\/p\//);

        // A host the stream never used is refused, and so is what is not an address of the app.
        const stranger = `pullwave-stream://p/${opened.stream.sessionId}/${Buffer.from('http://127.0.0.2:1/secret').toString('base64url')}`;
        expect((await answer(stranger)).status).toBe(403);

        await page.evaluate((id) => {
            return window.api.closeAnimeStream(id);
        }, opened.stream.sessionId);
        expect((await answer(opened.stream.url)).status).toBe(404);
    });

    test('says why the video could not be found', async () => {
        const { page } = session;
        await openAnimeTab(page);
        await search(page, 'nosource');
        await page.getByRole('button', { name: 'OPEN: Fake Anime', exact: true }).click();
        await page.getByRole('button', { name: 'EP 1', exact: true }).click();
        await page.getByRole('button', { name: 'WATCH', exact: true }).click();

        const alert = page.getByRole('dialog').getByRole('alert');
        await expect(alert).toHaveText('No video source was found for this episode.');
        await expect(alert).toHaveAttribute('title', 'No sources found for sub!');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();
    });

    test('closes the player with Escape while it plays', async () => {
        const { page } = session;
        await watchEpisode(page, '1');
        await expect(page.getByRole('dialog')).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toBeHidden();
        await expect(page.getByRole('button', { name: 'WATCH', exact: true })).toBeVisible();
    });
});
