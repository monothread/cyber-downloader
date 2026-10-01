import { expect, test, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Runs against the real source ani-cli reads, so it needs the network and can fail because of the source (it can change or
// block requests). It is left out unless PULLWAVE_LIVE=1, and run on demand by the "Test Windows" workflow.
const ROOT = resolve(__dirname, '../..');
const ELECTRON_PATH = createRequire(__filename)('electron') as unknown as string;
const EXE = process.platform === 'win32' ? '.exe' : '';
const HAS_ANI_TOOLS = [`busybox${EXE}`, `curl${EXE}`, 'ani-cli'].every((name) => {
    return existsSync(join(ROOT, 'resources', 'bin', 'ani', name));
});

test.skip(process.env.PULLWAVE_LIVE !== '1' || !HAS_ANI_TOOLS, 'set PULLWAVE_LIVE=1 (needs the network and `npm run fetch-binaries`)');
test.describe.configure({ mode: 'serial' });
test.setTimeout(300000);

let workDir: string;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), 'pullwave-live-e2e-'));
    const userData = join(workDir, 'user-data');
    mkdirSync(userData, { recursive: true });
    writeFileSync(
        join(userData, 'settings.json'),
        JSON.stringify({ language: 'en', checkUpdatesOnStart: false, animeQuality: 'worst', animeDownloadDir: join(workDir, 'anime'), downloadDir: join(workDir, 'downloads') })
    );
    app = await electron.launch({ executablePath: ELECTRON_PATH, args: [ROOT, '--no-sandbox', `--user-data-dir=${userData}`] });
    page = await app.firstWindow();
    await page.waitForSelector('.logo');
    await expect(page.getByText('// BOOTING SYSTEMS…')).toBeHidden({ timeout: 60000 });
});

test.afterAll(async () => {
    await app.close();
    rmSync(workDir, { recursive: true, force: true });
});

async function openFirstResult(): Promise<void> {
    await page.getByRole('button', { name: 'ANIME', exact: true }).click();
    await page.getByLabel('Anime name').fill('cyberpunk edgerunners');
    await page.getByLabel('Anime name').press('Enter');
    await page.getByRole('button', { name: 'OPEN: Cyberpunk: Edgerunners', exact: true }).click({ timeout: 60000 });
    await expect(page.getByRole('button', { name: 'EP 1', exact: true })).toBeVisible({ timeout: 60000 });
}

test('finds the anime and its episodes in the real source', async () => {
    await openFirstResult();
    await expect(page.getByText('10 EPISODES', { exact: true })).toBeVisible();
});

test('downloads an episode at the lowest quality, with its subtitles, and plays it', async () => {
    await page.getByRole('button', { name: 'EP 1', exact: true }).click();
    await page.getByRole('button', { name: 'DOWNLOAD SELECTED (1)' }).click();
    await page.getByRole('button', { name: /^DOWNLOADS \(\d+\)$/ }).click();
    await expect(page.locator('.job .badge--done')).toHaveText('DOWNLOADED', { timeout: 240000 });

    const folder = join(workDir, 'anime', 'Cyberpunk_ Edgerunners');
    expect(readdirSync(folder).sort()).toEqual(['Cyberpunk_ Edgerunners Episode 1.mp4', 'Cyberpunk_ Edgerunners Episode 1.vtt']);
    expect(statSync(join(folder, 'Cyberpunk_ Edgerunners Episode 1.mp4')).size).toBeGreaterThan(10_000_000);

    await page.getByRole('button', { name: 'BACK' }).click();
    await page.getByRole('button', { name: 'BACK' }).click();
    await page.getByRole('button', { name: 'LIBRARY', exact: true }).click();
    await page.getByRole('button', { name: 'SHOW EPISODES' }).click();
    await page.getByRole('button', { name: /^PLAY: / }).click();
    const video = page.getByRole('dialog').locator('video');
    await expect.poll(async () => {
        return video.evaluate((element: HTMLVideoElement) => {
            return element.readyState >= 2 ? element.duration : 0;
        });
    }, { timeout: 30000 }).toBeGreaterThan(1000);
    await video.evaluate((element: HTMLVideoElement) => {
        element.currentTime = 300;
    });
    await expect.poll(async () => {
        return video.evaluate((element: HTMLVideoElement) => {
            return element.currentTime;
        });
    }).toBeGreaterThan(300);
    await page.keyboard.press('Escape');
});

test('watches an episode without downloading it', async () => {
    await page.getByRole('button', { name: 'SEARCH', exact: true }).first().click();
    await page.getByRole('button', { name: 'OPEN: Cyberpunk: Edgerunners', exact: true }).click();
    await page.getByRole('button', { name: 'EP 2', exact: true }).click();
    await page.getByRole('button', { name: 'WATCH', exact: true }).click();
    const video = page.getByRole('dialog').locator('video');
    await expect.poll(async () => {
        return video.evaluate((element: HTMLVideoElement) => {
            return element.readyState >= 3 ? element.currentTime : -1;
        });
    }, { timeout: 60000 }).toBeGreaterThanOrEqual(0);
    await expect.poll(async () => {
        return video.evaluate((element: HTMLVideoElement) => {
            return element.currentTime;
        });
    }, { timeout: 15000 }).toBeGreaterThan(1);
    expect(existsSync(join(workDir, 'anime', 'Cyberpunk_ Edgerunners', 'Cyberpunk_ Edgerunners Episode 2.mp4'))).toBe(false);
    await page.keyboard.press('Escape');
});
