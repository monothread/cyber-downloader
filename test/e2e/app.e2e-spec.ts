import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const ELECTRON_PATH = createRequire(__filename)('electron') as unknown as string;
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
    hasExited: () => boolean;
}

let session: Session;

interface LaunchOptions {
    useFakeYtdlp?: boolean;
    settings?: Record<string, unknown>;
    env?: Record<string, string>;
}

async function launch(options: LaunchOptions = {}): Promise<Session> {
    const { useFakeYtdlp = true, settings = {}, env = {} } = options;
    const workDir = mkdtempSync(join(tmpdir(), 'cyber-dl-e2e-'));
    const userData = join(workDir, 'user-data');
    const downloadDir = join(workDir, 'downloads');
    const logPath = join(workDir, 'ytdlp-calls.log');
    writeFileSync(logPath, '');
    mkdirSync(userData, { recursive: true });
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ ...(useFakeYtdlp ? { ytdlpPath: FAKE_YTDLP } : {}), downloadDir, ...settings }));
    const app = await electron.launch({
        args: [ROOT, '--no-sandbox', `--user-data-dir=${userData}`],
        env: { ...process.env, FAKE_YTDLP_LOG: logPath, ...env }
    });
    let exited = false;
    app.on('close', () => {
        exited = true;
    });
    const page = await app.firstWindow();
    await page.waitForSelector('.logo');
    return {
        app,
        page,
        userData,
        downloadDir,
        logPath,
        hasExited: () => {
            return exited;
        }
    };
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
        const bundled = await launch({ useFakeYtdlp: false });
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

test('explains an HTTP 403 in plain words, keeps the raw error on demand and does not offer FIND STREAM', async () => {
    const { page } = session;
    await submitUrl(page, 'https://cdn.example.test/forbidden/videoplayback?id=1&sig=abc');
    const banner = page.getByRole('alert').filter({ hasText: 'Access refused by the server' });
    await expect(banner).toBeVisible();
    await expect(banner.locator('.error-banner__code')).toHaveText('FORBIDDEN');
    await expect(banner.locator('.error-banner__hint')).toContainText('The link may have expired or may only work for the original session, network or browser');
    await expect(page.locator('.badge', { hasText: 'FAILED' })).toBeVisible();
    await expect(banner.getByRole('button', { name: 'FIND STREAM' })).toHaveCount(0);
    await banner.getByRole('button', { name: 'SHOW DETAILS' }).click();
    await expect(banner.locator('.error-banner__raw')).toContainText('HTTP Error 403: Forbidden');
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

async function closeQuietly(own: Session): Promise<void> {
    await own.app.close().catch(() => {
        return undefined;
    });
    rmSync(resolve(own.userData, '..'), { recursive: true, force: true });
}

function windowVisible(own: Session): Promise<boolean> {
    return own.app.evaluate(({ BrowserWindow }) => {
        return BrowserWindow.getAllWindows()[0]?.isVisible() ?? false;
    });
}

async function closeMainWindow(own: Session): Promise<void> {
    await own.app
        .evaluate(({ BrowserWindow }) => {
            BrowserWindow.getAllWindows()[0]?.close();
        })
        .catch(() => {
            return undefined;
        });
}

function appExited(own: Session): boolean {
    return own.hasExited();
}

async function stubQuitDialog(own: Session, response: number): Promise<void> {
    await own.app.evaluate(({ dialog }, answer) => {
        const holder = globalThis as unknown as { quitPrompts: string[] };
        holder.quitPrompts = [];
        dialog.showMessageBox = (async (...args: unknown[]) => {
            const options = args[args.length - 1] as { message: string };
            holder.quitPrompts.push(options.message);
            return { response: answer, checkboxChecked: false };
        }) as typeof dialog.showMessageBox;
    }, response);
}

function quitPrompts(own: Session): Promise<string[]> {
    return own.app.evaluate(() => {
        return (globalThis as unknown as { quitPrompts: string[] }).quitPrompts;
    });
}

const KDE_ENV = { XDG_CURRENT_DESKTOP: 'KDE' };
const GNOME_WITHOUT_TRAY_ENV = { XDG_CURRENT_DESKTOP: 'GNOME', PATH: '/nonexistent' };

test.describe('close to tray', () => {
    test('is off by default: closing the window quits the app', async () => {
        const own = await launch({ env: KDE_ENV });
        try {
            await closeMainWindow(own);
            await expect.poll(() => {
                return appExited(own);
            }, { timeout: 8000 }).toBe(true);
        } finally {
            await closeQuietly(own);
        }
    });

    test('hides the window instead of quitting and a second launch brings it back', async () => {
        const own = await launch({ env: KDE_ENV, settings: { closeToTray: true } });
        try {
            await own.page.waitForTimeout(500);
            expect(await windowVisible(own)).toBe(true);

            await closeMainWindow(own);
            await expect.poll(() => {
                return windowVisible(own);
            }).toBe(false);
            expect(appExited(own)).toBe(false);

            const second = spawnSync(ELECTRON_PATH, [ROOT, '--no-sandbox', `--user-data-dir=${own.userData}`], { timeout: 20000, env: { ...process.env, ...KDE_ENV } });
            expect(second.status).toBe(0);
            await expect.poll(() => {
                return windowVisible(own);
            }).toBe(true);
            expect(appExited(own)).toBe(false);
        } finally {
            await closeQuietly(own);
        }
    });

    test('keeps downloads running while the window is hidden', async () => {
        const own = await launch({ env: KDE_ENV, settings: { closeToTray: true } });
        try {
            const marker = 'example.com/slow-tray-check';
            await own.page.waitForTimeout(500);
            await own.page.getByLabel('Link 1', { exact: true }).fill(`https://${marker}`);
            await own.page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
            await expect(own.page.locator('.badge', { hasText: 'DOWNLOADING' })).toBeVisible();

            await closeMainWindow(own);
            await expect.poll(() => {
                return windowVisible(own);
            }).toBe(false);
            await own.page.waitForTimeout(800);
            expect(countProcesses(marker)).toBeGreaterThan(0);

            spawnSync(ELECTRON_PATH, [ROOT, '--no-sandbox', `--user-data-dir=${own.userData}`], { timeout: 20000, env: { ...process.env, ...KDE_ENV } });
            await expect.poll(() => {
                return windowVisible(own);
            }).toBe(true);
            await expect(own.page.locator('.badge', { hasText: 'DOWNLOADING' })).toBeVisible();

            await own.app.evaluate(({ app }) => {
                app.quit();
            }).catch(() => {
                return undefined;
            });
            await expect.poll(() => {
                return countProcesses(marker);
            }, { timeout: 8000 }).toBe(0);
        } finally {
            await closeQuietly(own);
        }
    });

    test('can be turned on from the settings without a warning when a tray exists', async () => {
        const own = await launch({ env: KDE_ENV });
        try {
            await own.page.getByRole('button', { name: 'SETTINGS' }).click();
            const toggle = own.page.getByLabel('Keep running in the system tray when the window is closed');
            await expect(toggle).not.toBeChecked();
            await toggle.check();
            await expect(own.page.getByText('All changes saved.')).toBeVisible();
            expect(readSettings(own.userData).closeToTray).toBe(true);
            await expect(own.page.getByRole('alert')).toHaveCount(0);
            await own.page.waitForTimeout(500);

            await closeMainWindow(own);
            await expect.poll(() => {
                return windowVisible(own);
            }).toBe(false);
            expect(appExited(own)).toBe(false);
        } finally {
            await closeQuietly(own);
        }
    });

    test('on GNOME without a tray it warns and closing the window still quits the app', async () => {
        const own = await launch({ env: GNOME_WITHOUT_TRAY_ENV, settings: { closeToTray: true } });
        try {
            await own.page.getByRole('button', { name: 'SETTINGS' }).click();
            await expect(own.page.getByRole('alert')).toContainText('AppIndicator and KStatusNotifierItem Support');

            await closeMainWindow(own);
            await expect.poll(() => {
                return appExited(own);
            }, { timeout: 8000 }).toBe(true);
        } finally {
            await closeQuietly(own);
        }
    });
});

test.describe('quitting with downloads in progress', () => {
    test('asks first and keeps everything running when the user cancels', async () => {
        const own = await launch({ env: KDE_ENV });
        try {
            const marker = 'example.com/slow-cancel-quit-check';
            await stubQuitDialog(own, 1);
            await own.page.getByLabel('Link 1', { exact: true }).fill(`https://${marker}`);
            await own.page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
            await expect(own.page.locator('.badge', { hasText: 'DOWNLOADING' })).toBeVisible();

            await closeMainWindow(own);
            await expect.poll(() => {
                return quitPrompts(own);
            }).toEqual(['1 download is still in progress.']);
            expect(appExited(own)).toBe(false);
            expect(await windowVisible(own)).toBe(true);
            expect(countProcesses(marker)).toBeGreaterThan(0);
            await expect(own.page.locator('.badge', { hasText: 'DOWNLOADING' })).toBeVisible();
        } finally {
            await closeQuietly(own);
        }
    });

    test('quits and stops the download when the user confirms', async () => {
        const own = await launch({ env: KDE_ENV });
        try {
            const marker = 'example.com/slow-confirm-quit-check';
            await stubQuitDialog(own, 0);
            await own.page.getByLabel('Link 1', { exact: true }).fill(`https://${marker}`);
            await own.page.getByRole('button', { name: 'DOWNLOAD', exact: true }).click();
            await expect(own.page.locator('.badge', { hasText: 'DOWNLOADING' })).toBeVisible();

            await closeMainWindow(own);
            await expect.poll(() => {
                return appExited(own);
            }, { timeout: 8000 }).toBe(true);
            await expect.poll(() => {
                return countProcesses(marker);
            }, { timeout: 8000 }).toBe(0);
        } finally {
            await closeQuietly(own);
        }
    });

    test('quits without asking when nothing is downloading', async () => {
        const own = await launch({ env: KDE_ENV });
        try {
            await stubQuitDialog(own, 1);
            await closeMainWindow(own);
            await expect.poll(() => {
                return appExited(own);
            }, { timeout: 8000 }).toBe(true);
        } finally {
            await closeQuietly(own);
        }
    });
});

// ---- finding the stream of a page that yt-dlp does not understand (local pages, no external site involved)
const PAGES: Record<string, string> = {
    '/unsupported/static.html': '<html><head><title>Static Episode</title></head><body><video controls><source src="/media/static-clip.mp4" type="video/mp4"></video></body></html>',
    '/unsupported/embed.html': '<html><head><title>Embed Page</title></head><body><iframe src="/player/inner.html"></iframe></body></html>',
    '/player/inner.html': '<html><body><script>var config = {"hls": "\\/media\\/inner-master.m3u8"};</script></body></html>',
    '/unsupported/dynamic.html': `<html><head><title>Dynamic Episode</title></head><body><script>
        var parts = ['/me', 'dia/dyn', 'amic.m3u8'];
        window.addEventListener('load', function () {
            var video = document.createElement('video');
            video.muted = true;
            video.src = parts.join('');
            document.body.appendChild(video);
            video.play().catch(function () {});
        });
    </script></body></html>`,
    '/unsupported/none.html': '<html><head><title>Nothing here</title></head><body><p>No video on this page.</p></body></html>'
};

// A player like the ones embedded from video hosts: it lives in an iframe of ANOTHER origin, below the fold,
// only arms itself once the page is visible, needs a user gesture to start, and then asks for the video through
// a signed address without file extension.
const FRAME_PLAYER = `<html><body style="margin:0"><video id="v" muted playsinline width="640" height="360"></video>
<div id="overlay" style="position:absolute;inset:0;background:#000;display:flex;align-items:center;justify-content:center"><button id="play" style="font-size:40px">PLAY</button></div>
<script>
  var armed = false;
  function arm() { armed = true; }
  if (document.visibilityState === 'visible') { arm(); } else { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { arm(); } }); }
  document.getElementById('overlay').addEventListener('click', function () {
    if (!armed || !navigator.userActivation.isActive) { return; }
    var video = document.getElementById('v');
    video.src = '/videoplayback?expire=1999999999&ip=203.0.113.9&id=7081&itag=18&mime=video%2Fmp4&sig=AbC123';
    video.play().catch(function () {});
  });
</script></body></html>`;

function nestedPlayerPage(port: number): string {
    return `<html><head><title>Nested Player</title></head><body><h1>Episode</h1>
        <div style="height:1600px">spacer</div>
        <iframe src="http://localhost:${port}/frame/player.html" width="640" height="360" loading="lazy"></iframe></body></html>`;
}

// The same video asked for through two almost identical addresses (another host and another session parameter),
// like a mirror or a redirect would produce.
function variantsPage(port: number): string {
    const query = 'id=abc123&itag=18&mime=video%2Fmp4&sig=Sig&expire=1999999999&cpn=session&r1=1&r2=2';
    return `<html><head><title>Variants</title></head><body><script>
        window.addEventListener('load', function () {
            ['/videoplayback?${query}&extra=one', 'http://localhost:${port}/videoplayback?${query}&extra=two'].forEach(function (source) {
                var video = document.createElement('video');
                video.muted = true;
                video.src = source;
                document.body.appendChild(video);
                video.play().catch(function () {});
            });
        });
    </script></body></html>`;
}

function startLocalSite(): Promise<{ server: Server; origin: string }> {
    return new Promise((resolvePromise) => {
        const server = createServer((request, response) => {
            const path = (request.url ?? '/').split('?')[0] ?? '/';
            if (path === '/unsupported/variants.html') {
                response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                response.end(variantsPage((server.address() as AddressInfo).port));
            } else if (path === '/unsupported/nested.html') {
                response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                response.end(nestedPlayerPage((server.address() as AddressInfo).port));
            } else if (path === '/frame/player.html') {
                response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                response.end(FRAME_PLAYER);
            } else if (path === '/videoplayback') {
                response.writeHead(206, { 'content-type': 'video/mp4', 'content-length': 300000, 'content-range': 'bytes 0-299999/300000', 'accept-ranges': 'bytes' });
                response.end(Buffer.alloc(300000));
            } else if (PAGES[path]) {
                response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                response.end(PAGES[path]);
            } else if (path.endsWith('.m3u8')) {
                response.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' });
                response.end('#EXTM3U\n#EXT-X-ENDLIST\n');
            } else if (path.endsWith('.mp4')) {
                response.writeHead(200, { 'content-type': 'video/mp4' });
                response.end(Buffer.alloc(2048));
            } else {
                response.writeHead(404, { 'content-type': 'text/plain' });
                response.end('not found');
            }
        });
        server.listen(0, '127.0.0.1', () => {
            resolvePromise({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` });
        });
    });
}

function lastYtdlpCall(logPath: string, urlEnding: string): string[] {
    return (
        readCalls(logPath)
            .filter((call) => {
                return call.at(-1)?.endsWith(urlEnding);
            })
            .at(-1) ?? []
    );
}

test.describe('find stream', () => {
    let site: { server: Server; origin: string };

    test.beforeAll(async () => {
        site = await startLocalSite();
    });

    test.afterAll(async () => {
        await new Promise<void>((done) => {
            site.server.close(() => {
                done();
            });
        });
    });

    async function failOn(path: string): Promise<void> {
        await submitUrl(session.page, `${site.origin}${path}`);
        await expect(session.page.locator('.badge', { hasText: 'FAILED' })).toBeVisible();
        await expect(session.page.getByRole('alert').filter({ hasText: 'yt-dlp may be outdated' })).toBeVisible();
    }

    function panel() {
        return session.page.getByRole('region', { name: 'Stream finder' });
    }

    test('offers FIND STREAM only for failures a page scan can help with', async () => {
        const { page } = session;
        await submitUrl(page, 'https://example.com/fail');
        await expect(page.getByRole('alert').filter({ hasText: 'Video unavailable' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'FIND STREAM' })).toHaveCount(0);
    });

    test('finds a <video> source in the page and downloads it with the page as referer and its title as name', async () => {
        const { page, logPath } = session;
        await failOn('/unsupported/static.html');
        await page.getByRole('button', { name: 'FIND STREAM' }).click();

        const item = panel().getByRole('listitem');
        await expect(item).toHaveCount(1);
        await expect(item).toContainText('MP4');
        await expect(item).toContainText(`${site.origin}/media/static-clip.mp4`);
        await expect(item).toContainText('found in the page');
        await expect(panel()).toContainText('Protected (DRM) streams cannot be downloaded.');

        await panel().getByRole('button', { name: 'Download stream 1' }).click();
        await expect(panel()).toHaveCount(0);
        await expect(page.getByTestId('job-card')).toHaveCount(2);
        await expect(page.locator('.badge', { hasText: 'COMPLETE' })).toBeVisible();

        const args = lastYtdlpCall(logPath, '/media/static-clip.mp4');
        expect(args.at(-1)).toBe(`${site.origin}/media/static-clip.mp4`);
        expect(args[args.indexOf('--referer') + 1]).toBe(`${site.origin}/unsupported/static.html`);
        expect(args[args.indexOf('--user-agent') + 1]).toContain('Chrome/');
        expect(args[args.indexOf('-o') + 1]).toBe('Static Episode [%(id)s].%(ext)s');
        expect(args).not.toContain('--add-header');
    });

    test('follows an iframe and uses the iframe as the referer of what it finds', async () => {
        const { page, logPath } = session;
        await failOn('/unsupported/embed.html');
        await page.getByRole('button', { name: 'FIND STREAM' }).click();
        const item = panel().getByRole('listitem');
        await expect(item).toHaveCount(1);
        await expect(item).toContainText('HLS');
        await expect(item).toContainText(`${site.origin}/media/inner-master.m3u8`);
        await panel().getByRole('button', { name: 'Download stream 1' }).click();
        await expect(page.locator('.badge', { hasText: 'COMPLETE' })).toBeVisible();
        const args = lastYtdlpCall(logPath, '/media/inner-master.m3u8');
        expect(args[args.indexOf('--referer') + 1]).toBe(`${site.origin}/player/inner.html`);
        expect(args[args.indexOf('-o') + 1]).toBe('Embed Page [%(id)s].%(ext)s');
    });

    test('falls back to the hidden browser for a player built by JavaScript', async () => {
        const { page, logPath } = session;
        await failOn('/unsupported/dynamic.html');
        await page.getByRole('button', { name: 'FIND STREAM' }).click();
        const item = panel().getByRole('listitem');
        await expect(item).toHaveCount(1, { timeout: 30000 });
        await expect(item).toContainText('HLS');
        await expect(item).toContainText(`${site.origin}/media/dynamic.m3u8`);
        await expect(item).toContainText('seen on the network');
        await expect(panel().getByRole('button', { name: 'NOT THE ONE? SEARCH DEEPER' })).toHaveCount(0);

        await panel().getByRole('button', { name: 'Download stream 1' }).click();
        await expect(page.locator('.badge', { hasText: 'COMPLETE' })).toBeVisible();
        const args = lastYtdlpCall(logPath, '/media/dynamic.m3u8');
        expect(args[args.indexOf('--referer') + 1]).toMatch(new RegExp(`^${site.origin.replace(/[.:/]/g, '\\$&')}/`));
        expect(args[args.indexOf('-o') + 1]).toBe('Dynamic Episode [%(id)s].%(ext)s');
    });

    test('finds a player inside a cross-origin iframe that needs visibility and a user gesture, served from a signed address', async () => {
        test.setTimeout(60000);
        const { page, logPath } = session;
        await failOn('/unsupported/nested.html');
        await page.getByRole('button', { name: 'FIND STREAM' }).click();
        const item = panel().getByRole('listitem');
        await expect(item).toHaveCount(1, { timeout: 40000 });
        await expect(item).toContainText('MP4');
        await expect(item).toContainText('/videoplayback?expire=1999999999');
        await expect(item).toContainText('seen on the network');

        await panel().getByRole('button', { name: 'Download stream 1' }).click();
        await expect(page.locator('.badge', { hasText: 'COMPLETE' })).toBeVisible();
        const args = lastYtdlpCall(logPath, 'sig=AbC123');
        expect(args.at(-1)).toContain('/videoplayback?expire=1999999999&ip=203.0.113.9&id=7081&itag=18&mime=video%2Fmp4&sig=AbC123');
        expect(args[args.indexOf('--referer') + 1]).toMatch(/^http:\/\/localhost:\d+\//);
        expect(args[args.indexOf('-o') + 1]).toBe('Nested Player [%(id)s].%(ext)s');
    });

    test('lists one video once when it is asked for through near-identical addresses', async () => {
        test.setTimeout(60000);
        const { page } = session;
        await failOn('/unsupported/variants.html');
        await page.getByRole('button', { name: 'FIND STREAM' }).click();
        const item = panel().getByRole('listitem');
        await expect(item).toHaveCount(1, { timeout: 40000 });
        await expect(item).toContainText('/videoplayback?id=abc123');
        await expect(item).toContainText('+1 alternate address');
    });

    test('can search deeper with the browser after a static result', async () => {
        const { page } = session;
        await failOn('/unsupported/static.html');
        await page.getByRole('button', { name: 'FIND STREAM' }).click();
        await expect(panel().getByRole('listitem')).toHaveCount(1);
        await panel().getByRole('button', { name: 'NOT THE ONE? SEARCH DEEPER' }).click();
        await expect(panel().getByRole('button', { name: 'NOT THE ONE? SEARCH DEEPER' })).toHaveCount(0, { timeout: 35000 });
        await expect(panel().getByRole('listitem')).toHaveCount(1);
    });

    test('says so when the page has no video', async () => {
        test.setTimeout(60000);
        await session.app.close();
        rmSync(resolve(session.userData, '..'), { recursive: true, force: true });
        session = await launch({ env: { CYBER_DL_SNIFF_TIMEOUT_MS: '3000' } });
        await failOn('/unsupported/none.html');
        await session.page.getByRole('button', { name: 'FIND STREAM' }).click();
        await expect(panel()).toContainText('No video stream was found.', { timeout: 30000 });
        await expect(panel().getByRole('button', { name: /DOWNLOAD|SEARCH DEEPER/ })).toHaveCount(0);
        await expect(panel()).toContainText('Protected (DRM) streams cannot be downloaded.');
    });

    test('lets the user cancel a search and close the panel', async () => {
        test.setTimeout(60000);
        await session.app.close();
        rmSync(resolve(session.userData, '..'), { recursive: true, force: true });
        session = await launch({ env: { CYBER_DL_SNIFF_TIMEOUT_MS: '20000' } });
        await failOn('/unsupported/none.html');
        await session.page.getByRole('button', { name: 'FIND STREAM' }).click();
        await expect(panel()).toContainText('Watching the page’s network activity', { timeout: 15000 });
        await panel().getByRole('button', { name: 'CANCEL' }).click();
        await expect(panel()).toContainText('Search cancelled.', { timeout: 5000 });
        await panel().getByRole('button', { name: 'Close stream finder' }).click();
        await expect(panel()).toHaveCount(0);
        await expect(session.page.getByRole('button', { name: 'FIND STREAM' })).toBeVisible();
    });
});

