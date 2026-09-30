import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const FAKE_YTDLP = resolve(__dirname, 'fixtures/fake-yt-dlp.js');
const BUNDLED_DIR = join(ROOT, 'resources', 'bin');
const HAS_BUNDLED_BINARIES = ['yt-dlp', 'ffmpeg', 'deno'].every((name) => {
    return existsSync(join(BUNDLED_DIR, name));
});

interface Session {
    app: ElectronApplication;
    page: Page;
    userData: string;
    downloadDir: string;
    logPath: string;
}

let session: Session;

async function launch(useFakeYtdlp = true): Promise<Session> {
    const workDir = mkdtempSync(join(tmpdir(), 'cyber-dl-e2e-'));
    const userData = join(workDir, 'user-data');
    const downloadDir = join(workDir, 'downloads');
    const logPath = join(workDir, 'ytdlp-calls.log');
    writeFileSync(logPath, '');
    mkdirSync(userData, { recursive: true });
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ ...(useFakeYtdlp ? { ytdlpPath: FAKE_YTDLP } : {}), downloadDir }));
    const app = await electron.launch({
        args: [ROOT, '--no-sandbox', `--user-data-dir=${userData}`],
        env: { ...process.env, FAKE_YTDLP_LOG: logPath }
    });
    const page = await app.firstWindow();
    await page.waitForSelector('.logo');
    return { app, page, userData, downloadDir, logPath };
}

function readCalls(logPath: string): string[][] {
    return readFileSync(logPath, 'utf-8')
        .split('\n')
        .filter((line) => {
            return line.length > 0;
        })
        .map((line) => {
            return JSON.parse(line) as string[];
        });
}

async function submitUrl(page: Page, url: string): Promise<void> {
    await page.getByLabel('Link 1', { exact: true }).fill(url);
    await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
}

function readSettings(userData: string): Record<string, unknown> {
    return JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf-8')) as Record<string, unknown>;
}

test.beforeEach(async () => {
    session = await launch();
});

test.afterEach(async () => {
    await session.app.close();
    rmSync(resolve(session.userData, '..'), { recursive: true, force: true });
});

test('shows the detected yt-dlp version and marks the custom path as its source', async () => {
    const { page } = session;
    const chip = page.locator('.chip--ok', { hasText: 'yt-dlp fake-1.0' });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('title', `${FAKE_YTDLP} (custom)`);
    await expect(page.locator('.chip', { hasText: 'ffmpeg' })).toBeVisible();
});

test.describe('bundled binaries', () => {
    test.skip(!HAS_BUNDLED_BINARIES, 'run `npm run fetch-binaries` to enable these tests');

    test('uses the bundled yt-dlp and ffmpeg by default', async () => {
        const bundled = await launch(false);
        try {
            const ytdlpChip = bundled.page.locator('.chip--ok', { hasText: /^yt-dlp \d/ });
            await expect(ytdlpChip).toBeVisible();
            await expect(ytdlpChip).toHaveAttribute('title', `${join(BUNDLED_DIR, 'yt-dlp')} (bundled)`);
            const ffmpegChip = bundled.page.locator('.chip--ok', { hasText: /^ffmpeg \d/ });
            await expect(ffmpegChip).toBeVisible();
            await expect(ffmpegChip).toHaveAttribute('title', `${join(BUNDLED_DIR, 'ffmpeg')} (bundled)`);
        } finally {
            await bundled.app.close();
            rmSync(resolve(bundled.userData, '..'), { recursive: true, force: true });
        }
    });

    test('passes the bundled ffmpeg folder to yt-dlp and puts the bundled folder first in PATH', async () => {
        const { page, logPath } = session;
        await submitUrl(page, 'https://example.com/ok');
        await expect(page.locator('.badge', { hasText: 'COMPLETE' })).toBeVisible();
        const args = readCalls(logPath).find((call) => {
            return call.includes('--no-playlist');
        }) ?? [];
        expect(args[args.indexOf('--ffmpeg-location') + 1]).toBe(BUNDLED_DIR);
        expect(readFileSync(`${logPath}.env`, 'utf-8').startsWith(`${BUNDLED_DIR}:`)).toBe(true);
    });
});

test('downloads a video, shows progress completion and records history', async () => {
    const { page, downloadDir, logPath } = session;
    await submitUrl(page, 'https://example.com/watch?v=ok');

    const card = page.getByTestId('job-card');
    await expect(card.locator('.job__title')).toHaveText('Fake Video');
    await expect(card.locator('.badge')).toHaveText('COMPLETE');
    await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    await expect(card.getByRole('button', { name: 'SHOW FILE' })).toBeVisible();

    const calls = readCalls(logPath).filter((args) => {
        return !args.includes('--version');
    });
    expect(calls).toHaveLength(1);
    const args = calls[0] ?? [];
    expect(args[args.indexOf('-P') + 1]).toBe(downloadDir);
    expect(args.slice(-2)).toEqual(['--', 'https://example.com/watch?v=ok']);
    expect(args).toContain('--no-playlist');

    await page.getByRole('button', { name: 'HISTORY' }).click();
    const item = page.locator('.history__item--done');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText('Fake Video');
    await expect(item).toContainText('COMPLETE');
});

test('shows a friendly error banner with details and retries the download', async () => {
    const { page } = session;
    await submitUrl(page, 'https://example.com/fail');

    const banner = page.getByRole('alert').filter({ hasText: 'Video unavailable' });
    await expect(banner).toBeVisible();
    await expect(banner.locator('.error-banner__code')).toHaveText('UNAVAILABLE');
    await expect(banner.locator('.error-banner__hint')).toHaveText('The video may be private, removed or blocked in your region.');
    await expect(page.getByTestId('job-card').locator('.badge')).toHaveText('FAILED');

    await banner.getByRole('button', { name: 'SHOW DETAILS' }).click();
    await expect(banner.locator('.error-banner__raw')).toHaveText('ERROR: [youtube] abc: Video unavailable');

    await banner.getByRole('button', { name: 'RETRY' }).click();
    await expect(page.getByTestId('job-card').locator('.badge')).toHaveText('FAILED');
    await page.getByRole('button', { name: 'HISTORY' }).click();
    await expect(page.locator('.history__item--error')).toHaveCount(2);
    await expect(page.locator('.history__item--error').first()).toContainText('FAILED — Video unavailable');
});

test('cancels a running download and lets the user remove it', async () => {
    const { page } = session;
    await submitUrl(page, 'https://example.com/slow');

    const card = page.getByTestId('job-card');
    await expect(card.locator('.badge')).toHaveText('DOWNLOADING');
    await card.getByRole('button', { name: 'CANCEL' }).click();
    await expect(card.locator('.badge')).toHaveText('CANCELLED');

    await card.getByRole('button', { name: 'REMOVE' }).click();
    await expect(page.getByTestId('job-card')).toHaveCount(0);
    await expect(page.getByText('NO ACTIVE DOWNLOADS')).toBeVisible();
});

test('shows the error on the link row for an invalid URL, keeps it for editing and does not create a job', async () => {
    const { page } = session;
    await submitUrl(page, 'not-a-url');
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid URL. Use an http(s) link.' })).toBeVisible();
    await expect(page.getByLabel('Link 1', { exact: true })).toHaveValue('not-a-url');
    await expect(page.getByLabel('Link 1', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('job-card')).toHaveCount(0);

    await page.getByLabel('Link 1', { exact: true }).fill('https://example.com/ok');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
    await expect(page.locator('.badge', { hasText: 'COMPLETE' })).toBeVisible();
});

test('asks for a link when every row is empty', async () => {
    const { page } = session;
    await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Paste at least one video URL.' })).toBeVisible();
    await expect(page.getByTestId('job-card')).toHaveCount(0);
});

test('adds several links with the add button, queues them all and resets the rows', async () => {
    const { page } = session;
    await page.getByLabel('Link 1', { exact: true }).fill('https://example.com/ok1');
    await page.getByRole('button', { name: '+ ADD LINK' }).click();
    await expect(page.getByLabel('Link 2', { exact: true })).toBeFocused();
    await page.getByLabel('Link 2', { exact: true }).fill('https://example.com/ok2');
    await page.getByRole('button', { name: '+ ADD LINK' }).click();
    await page.getByLabel('Link 3', { exact: true }).fill('https://example.com/ok3');
    await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();

    await expect(page.getByTestId('job-card')).toHaveCount(3);
    await expect(page.locator('.badge', { hasText: 'COMPLETE' })).toHaveCount(3);
    await expect(page.getByLabel('Link 1', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Link 2', { exact: true })).toHaveCount(0);
});

test('removes a link row with its remove button', async () => {
    const { page } = session;
    await page.getByRole('button', { name: '+ ADD LINK' }).click();
    await page.getByLabel('Link 1', { exact: true }).fill('https://example.com/first');
    await page.getByLabel('Link 2', { exact: true }).fill('https://example.com/second');
    await page.getByRole('button', { name: 'Remove link 1' }).click();
    await expect(page.getByLabel('Link 2', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Link 1', { exact: true })).toHaveValue('https://example.com/second');
    await expect(page.getByRole('button', { name: /Remove link/ })).toHaveCount(0);
});

test('queues the valid links and keeps only the invalid one with its error', async () => {
    const { page } = session;
    await page.getByLabel('Link 1', { exact: true }).fill('https://example.com/ok1');
    await page.getByRole('button', { name: '+ ADD LINK' }).click();
    await page.getByLabel('Link 2', { exact: true }).fill('not-a-url');
    await page.getByRole('button', { name: '+ ADD LINK' }).click();
    await page.getByLabel('Link 3', { exact: true }).fill('https://example.com/ok3');
    await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();

    await expect(page.getByTestId('job-card')).toHaveCount(2);
    await expect(page.getByLabel('Link 2', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Link 1', { exact: true })).toHaveValue('not-a-url');
    await expect(page.getByRole('alert').filter({ hasText: 'Invalid URL. Use an http(s) link.' })).toBeVisible();
});

test('handles a very long link without resizing the field or overflowing the page', async () => {
    const { page, logPath } = session;
    const longUrl = `https://example.com/watch?v=abc&list=${'x'.repeat(1500)}`;
    const field = page.getByLabel('Link 1', { exact: true });
    await field.fill(longUrl);

    const before = await field.boundingBox();
    expect(before).not.toBeNull();
    expect(await field.evaluate((element: HTMLInputElement) => {
        return element.tagName === 'INPUT' && element.scrollWidth > element.clientWidth;
    })).toBe(true);
    expect(await page.evaluate(() => {
        return document.documentElement.scrollWidth <= window.innerWidth;
    })).toBe(true);
    await expect(field).toHaveValue(longUrl);

    await page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
    await expect(page.locator('.badge', { hasText: 'COMPLETE' })).toBeVisible();
    const after = await field.boundingBox();
    expect(after?.width).toBe(before?.width);
    expect(after?.height).toBe(before?.height);
    const args = readCalls(logPath).find((call) => {
        return call.includes('--no-playlist');
    }) ?? [];
    expect(args.at(-1)).toBe(longUrl);
});

test('settings have no save button and are saved automatically', async () => {
    const { page, userData } = session;
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.getByRole('button', { name: 'SAVE SETTINGS' })).toHaveCount(0);
    await expect(page.getByText('Changes are saved automatically.')).toBeVisible();

    await page.getByLabel('Video container').selectOption('mkv');
    await expect(page.getByText('All changes saved.')).toBeVisible();
    expect(readSettings(userData).videoContainer).toBe('mkv');

    await page.getByLabel('Max title length (characters)').fill('66');
    await expect(page.getByText('Unsaved changes…')).toBeVisible();
    expect(readSettings(userData).maxTitleLength).toBe(80);
    await expect(page.getByText('All changes saved.')).toBeVisible({ timeout: 6000 });
    expect(readSettings(userData).maxTitleLength).toBe(66);
});

test('pending text edits are saved when leaving the settings tab', async () => {
    const { page, userData } = session;
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await page.getByLabel('Subtitle languages').fill('fr,de');
    await page.getByRole('button', { name: 'DOWNLOADS' }).click();
    await expect.poll(() => {
        return readSettings(userData).subtitleLangs;
    }).toBe('fr,de');
});

test('persists edited settings to disk and passes them to yt-dlp', async () => {
    const { page, userData, logPath, downloadDir } = session;
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await page.getByLabel('Max title length (characters)').fill('55');
    await page.getByLabel('Video quality').selectOption('720');
    await page.getByLabel('Video container').selectOption('mkv');
    await page.getByLabel('Use cookies from my browser').check();
    await page.getByLabel('Browser', { exact: true }).selectOption('brave');
    await page.getByLabel('Download whole playlist').check();
    await page.getByLabel('JavaScript runtime').fill('node');
    await expect(page.getByText('All changes saved.')).toBeVisible({ timeout: 6000 });

    expect(readSettings(userData)).toMatchObject({
        maxTitleLength: 55,
        maxResolution: '720',
        videoContainer: 'mkv',
        useBrowserCookies: true,
        cookiesBrowser: 'brave',
        downloadPlaylist: true,
        jsRuntime: 'node',
        downloadDir,
        ytdlpPath: FAKE_YTDLP
    });

    await page.getByRole('button', { name: 'DOWNLOADS' }).click();
    await submitUrl(page, 'https://example.com/ok');
    await expect(page.locator('.badge', { hasText: 'COMPLETE' })).toBeVisible();
    const args = readCalls(logPath).find((call) => {
        return call.includes('--yes-playlist');
    }) ?? [];
    expect(args[args.indexOf('-o') + 1]).toBe('%(title).55s [%(id)s].%(ext)s');
    expect(args[args.indexOf('-f') + 1]).toBe('bv*[height<=720]+ba/b[height<=720]');
    expect(args[args.indexOf('--merge-output-format') + 1]).toBe('mkv');
    expect(args[args.indexOf('--cookies-from-browser') + 1]).toBe('brave');
    expect(args[args.indexOf('--js-runtimes') + 1]).toBe('node');
});

test('audio-only quick toggle switches to audio extraction', async () => {
    const { page, logPath } = session;
    await page.getByLabel('AUDIO ONLY').check();
    await submitUrl(page, 'https://example.com/ok');
    await expect(page.locator('.badge', { hasText: 'COMPLETE' })).toBeVisible();
    const args = readCalls(logPath).find((call) => {
        return call.includes('-x');
    }) ?? [];
    expect(args).toEqual(expect.arrayContaining(['-x', '--audio-format', 'mp3', '-f', 'ba/b']));
});

test('updating yt-dlp shows the command output in a notice', async () => {
    const { page } = session;
    await page.getByRole('button', { name: 'UPDATE YT-DLP' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Fake yt-dlp is up to date' })).toBeVisible();
});

test('app updates are reported as unsupported outside the installed app', async () => {
    const { page } = session;
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.getByText(/^Current version: \d+\.\d+\.\d+/)).toBeVisible();
    await page.getByRole('button', { name: 'CHECK FOR UPDATES' }).click();
    await expect(page.getByText('Updates are only available in the installed app.')).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'is available' })).toHaveCount(0);
});

test('the startup update check setting is saved', async () => {
    const { page, userData } = session;
    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.getByLabel('Check for updates on startup')).toBeChecked();
    await page.getByLabel('Check for updates on startup').uncheck();
    await expect(page.getByText('All changes saved.')).toBeVisible();
    expect(readSettings(userData).checkUpdatesOnStart).toBe(false);
});

function countProcesses(marker: string): number {
    try {
        return Number(execFileSync('pgrep', ['-fc', marker], { encoding: 'utf-8' }).trim());
    } catch {
        return 0;
    }
}

test('closing the app stops downloads that are still running', async () => {
    const own = await launch();
    try {
        const marker = 'example.com/quiet-shutdown-check';
        await own.page.getByLabel('Link 1', { exact: true }).fill(`https://${marker}`);
        await own.page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
        await expect(own.page.locator('.badge', { hasText: 'DOWNLOADING' })).toBeVisible();
        await expect.poll(() => {
            return countProcesses(marker);
        }).toBeGreaterThan(0);

        await own.app.close();

        await expect.poll(() => {
            return countProcesses(marker);
        }, { timeout: 8000 }).toBe(0);
    } finally {
        rmSync(resolve(own.userData, '..'), { recursive: true, force: true });
    }
});

