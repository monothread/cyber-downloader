import { expect, test, _electron as electron, type ElectronApplication, type Locator, type Page } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');
const ELECTRON_PATH = createRequire(__filename)('electron') as unknown as string;
const FAKE_ANI_CLI = resolve(__dirname, 'fixtures/fake-ani-cli.sh');
const EXE = process.platform === 'win32' ? '.exe' : '';
const HAS_ANI_TOOLS = [`busybox${EXE}`, `curl${EXE}`, 'ani-cli'].every((name) => {
    return existsSync(join(ROOT, 'resources', 'bin', 'ani', name));
});
const LONG_TITLE = 'An extremely long title that goes on and on and on for a very long time so that it has to be cut short somewhere '.repeat(4);

let workDir: string;
let app: ElectronApplication;
let page: Page;

async function height(locator: Locator): Promise<number> {
    const box = await locator.boundingBox();
    return Math.round((box?.height ?? 0) * 10) / 10;
}

async function size(locator: Locator): Promise<{ width: number; height: number }> {
    const box = await locator.boundingBox();
    return { width: Math.round(box?.width ?? 0), height: Math.round(box?.height ?? 0) };
}

async function launch(theme: string): Promise<void> {
    workDir = mkdtempSync(join(tmpdir(), 'pullwave-buttons-e2e-'));
    const userData = join(workDir, 'user-data');
    mkdirSync(userData, { recursive: true });
    writeFileSync(join(userData, 'settings.json'), JSON.stringify({ language: 'en', theme, checkUpdatesOnStart: false }));
    writeFileSync(
        join(userData, 'history.json'),
        JSON.stringify([
            { id: 'a', url: 'https://x/1', title: LONG_TITLE, filePath: '/tmp/a.mp4', status: 'done', errorTitle: null, finishedAt: 1700000000000 },
            { id: 'b', url: 'https://x/2', title: 'Short', filePath: '/tmp/b.mp4', status: 'done', errorTitle: null, finishedAt: 1700000000000 }
        ])
    );
    app = await electron.launch({ executablePath: ELECTRON_PATH, args: [ROOT, '--no-sandbox', `--user-data-dir=${userData}`], env: { ...process.env, PULLWAVE_ANI_CLI: FAKE_ANI_CLI } });
    page = await app.firstWindow();
    await page.setViewportSize({ width: 1100, height: 780 });
    await page.waitForSelector('.logo');
    // The screens only show up once yt-dlp and ffmpeg were probed, which can take a while the first time on Windows.
    await expect(page.getByText('// BOOTING SYSTEMS…')).toBeHidden({ timeout: 60000 });
}

test.afterEach(async () => {
    await app.close();
    rmSync(workDir, { recursive: true, force: true });
});

for (const theme of ['cyberpunk', 'light']) {
    test.describe(`button sizes (${theme} theme)`, () => {
        test.beforeEach(async () => {
            await launch(theme);
        });

        test('the buttons beside a link are as tall as the field', async () => {
            const input = page.getByLabel('Link 1', { exact: true });
            const fieldHeight = await height(input);
            expect(fieldHeight).toBe(39);
            expect(await height(page.getByRole('button', { name: 'FOLDER' }))).toBe(fieldHeight);
            expect(await height(page.getByRole('button', { name: 'OPTIONS' }))).toBe(fieldHeight);

            await page.getByRole('button', { name: '+ ADD LINK' }).click();
            const removeButtons = await page.getByRole('button', { name: /^Remove link/ }).all();
            expect(removeButtons).toHaveLength(2);
            for (const remove of removeButtons) {
                expect(await height(remove)).toBe(fieldHeight);
            }
            expect(await height(page.getByRole('button', { name: '+ ADD LINK' }))).toBe(fieldHeight);
            expect(await height(page.getByRole('button', { name: 'DOWNLOAD', exact: true }))).toBe(fieldHeight);
        });

        test('every button of a row of the settings is as tall as the field of that row', async () => {
            await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
            const folder = page.getByLabel('Download folder', { exact: true });
            expect(await height(page.getByRole('button', { name: 'BROWSE' }).first())).toBe(await height(folder));
            const rows = await page.locator('.settings .field-row .btn').all();
            expect(rows.length).toBeGreaterThan(2);
            for (const button of rows) {
                expect(await height(button)).toBe(39);
            }
            expect(await height(page.locator('.settings select').first())).toBe(39);
        });

        test('the search of an anime lines up: field, audio and button are the same height as the tabs', async () => {
            test.skip(!HAS_ANI_TOOLS, 'the anime section needs `npm run fetch-binaries`');
            await page.getByRole('button', { name: 'ANIME', exact: true }).click();
            const heights = [
                await height(page.getByLabel('Anime name')),
                await height(page.getByLabel('Audio')),
                await height(page.locator('form .btn')),
                await height(page.getByRole('button', { name: /^DOWNLOADS \(\d+\)$/ })),
                await height(page.getByRole('navigation', { name: 'Anime' }).getByRole('button').first())
            ];
            expect(new Set(heights)).toEqual(new Set([39]));
            const form = await page.locator('form .btn').boundingBox();
            const field = await page.getByLabel('Anime name').boundingBox();
            expect(form?.y).toBe(field?.y);
        });

        test('the fields of the anime settings line up in rows', async () => {
            test.skip(!HAS_ANI_TOOLS, 'the anime section needs `npm run fetch-binaries`');
            await page.setViewportSize({ width: 1100, height: 900 });
            await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
            const top = async (label: string): Promise<number> => {
                return Math.round((await page.getByLabel(label, { exact: true }).boundingBox())?.y ?? -1);
            };
            const labelTop = async (name: string): Promise<number> => {
                return Math.round((await page.locator('.settings .field__label', { hasText: name }).first().boundingBox())?.y ?? -1);
            };
            // The first row: the folder (with its button) and the quality; the second: the audio and the subtitles.
            expect(await top('Anime download folder')).toBe(await top('Anime quality'));
            expect(await labelTop('Anime download folder')).toBe(await labelTop('Anime quality'));
            expect(await top('Anime audio')).toBe(await top('Anime subtitles'));
            expect(await labelTop('Anime audio')).toBe(await labelTop('Anime subtitles'));
            expect(await top('Anime download folder')).toBeLessThan(await top('Anime audio'));
            expect(await height(page.getByLabel('Anime quality', { exact: true }))).toBe(await height(page.getByLabel('Anime download folder', { exact: true })));
        });

        test('the button of a history entry keeps its size however long the title is', async () => {
            await page.getByRole('button', { name: 'HISTORY', exact: true }).click();
            const buttons = page.getByRole('button', { name: 'SHOW FILE' });
            await expect(buttons).toHaveCount(2);
            const [long, short] = [await size(buttons.nth(0)), await size(buttons.nth(1))];
            expect(long).toEqual(short);
            expect(long.height).toBe(28);

            const title = page.locator('.history__title').first();
            const row = page.locator('.history__item').first();
            expect((await title.boundingBox())?.width ?? 0).toBeLessThan((await row.boundingBox())?.width ?? 0);
            expect(await title.evaluate((element) => {
                return element.scrollWidth > element.clientWidth;
            })).toBe(true);
        });
    });
}
