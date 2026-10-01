import { DEFAULT_SETTINGS } from '@shared/constants';
import {
    animeBaseDirectory,
    animeDownloadDirectory,
    folderNameBudget,
    MAX_FOLDER_NAME_LENGTH,
    MIN_FOLDER_NAME_LENGTH,
    WINDOWS_PATH_BUDGET,
    animeFileName,
    animeFolderName,
    animeFoldersToRemove,
    DEFAULT_ANIME_FOLDER,
    filesOfEpisode,
    removeDirectories,
    subtitlePathFor
} from '@main/services/animeFiles';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanTempDirs, makeTempDir } from '../../helpers/tempDir';

afterEach(() => {
    cleanTempDirs();
});

describe('subtitlePathFor', () => {
    it('swaps the extension for .vtt', () => {
        expect(subtitlePathFor('/lib/Naruto/Naruto Episode 1.mp4')).toBe('/lib/Naruto/Naruto Episode 1.vtt');
        expect(subtitlePathFor('/lib/a.mkv')).toBe('/lib/a.vtt');
    });

    it('only changes the last extension', () => {
        expect(subtitlePathFor('/lib/Mr. Robot Episode 1.mp4')).toBe('/lib/Mr. Robot Episode 1.vtt');
    });

    it('adds the extension when the file has none', () => {
        expect(subtitlePathFor('/lib/episode')).toBe('/lib/episode.vtt');
    });
});

describe('filesOfEpisode', () => {
    it('lists the video and its subtitles', () => {
        expect(filesOfEpisode('/lib/a.mp4')).toEqual(['/lib/a.mp4', '/lib/a.vtt']);
    });
});

describe('animeFolderName', () => {
    it('keeps a normal title', () => {
        expect(animeFolderName('Cyberpunk: Edgerunners')).toBe('Cyberpunk_ Edgerunners');
    });

    it('replaces what a file system does not accept', () => {
        expect(animeFolderName('A<B>C:D"E/F\\G|H?I*J', { platform: 'linux' })).toBe('A_B_C_D_E_F_G_H_I_J');
    });

    it('replaces control characters', () => {
        expect(animeFolderName(`one${String.fromCharCode(0)}two${String.fromCharCode(31)}three`)).toBe('one_two_three');
    });

    it('removes leading dots, so the folder is never hidden or a parent reference', () => {
        expect(animeFolderName('..hidden')).toBe('hidden');
        expect(animeFolderName('..')).toBe('anime');
    });

    it('limits the length and trims', () => {
        expect(animeFolderName(`${'a'.repeat(99)} bbb`)).toBe('a'.repeat(99));
        expect(animeFolderName(`  ${'x'.repeat(150)}  `)).toHaveLength(100);
    });

    it('falls back to a name when nothing is left', () => {
        expect(animeFolderName('   ')).toBe('anime');
        expect(animeFolderName('')).toBe('anime');
    });
});


describe('animeFileName', () => {
    it('names the file the way ani-cli does', () => {
        expect(animeFileName('Cyberpunk: Edgerunners', '3')).toBe('Cyberpunk_ Edgerunners Episode 3.mp4');
        expect(animeFileName('Fate/Zero', '12.5')).toBe('Fate_Zero Episode 12.5.mp4');
    });
});

describe('animeBaseDirectory', () => {
    it('uses the folder of the settings', () => {
        expect(animeBaseDirectory({ ...DEFAULT_SETTINGS, animeDownloadDir: '/media/anime' }, '/home/me/Downloads', 'linux')).toBe('/media/anime');
    });

    it('falls back to a folder inside Downloads', () => {
        expect(DEFAULT_ANIME_FOLDER).toBe('Pullwave Anime');
        expect(animeBaseDirectory(DEFAULT_SETTINGS, '/home/me/Downloads', 'linux')).toBe('/home/me/Downloads/Pullwave Anime');
    });
});

describe('animeFoldersToRemove', () => {
    it('gives the folder of the files and the one a download would use now, without repeating', () => {
        expect(animeFoldersToRemove('Naruto', ['/old/Naruto/a.mp4', '/old/Naruto/b.mp4'], '/new', 'linux')).toEqual(['/old/Naruto', '/new/Naruto']);
        expect(animeFoldersToRemove('Naruto', ['/lib/Naruto/a.mp4'], '/lib', 'linux')).toEqual(['/lib/Naruto']);
    });

    it('gives the folder a download would use even when nothing was downloaded', () => {
        expect(animeFoldersToRemove('Naruto', [], '/lib', 'linux')).toEqual(['/lib/Naruto']);
    });

    it('never gives a folder that is not named after the anime', () => {
        expect(animeFoldersToRemove('Naruto', ['/home/me/Videos/a.mp4', '/lib/Naruto/b.mp4'], '/lib', 'linux')).toEqual(['/lib/Naruto']);
        expect(animeFoldersToRemove('Naruto', ['/home/me/Videos/a.mp4'], '/lib', 'linux')).toEqual(['/lib/Naruto']);
    });

    it('matches the name the folder was created with', () => {
        expect(animeFoldersToRemove('Re:Zero', ['/lib/Re_Zero/a.mp4'], '/lib', 'linux')).toEqual(['/lib/Re_Zero']);
    });
});

describe('removeDirectories', () => {
    it('removes folders with everything in them, and ignores one that is not there', () => {
        const root = makeTempDir();
        mkdirSync(join(root, 'Naruto', 'nested'), { recursive: true });
        writeFileSync(join(root, 'Naruto', 'a.mp4'), 'x');
        writeFileSync(join(root, 'Naruto', 'nested', 'a.part'), 'x');
        mkdirSync(join(root, 'Bleach'));

        removeDirectories([join(root, 'Naruto'), join(root, 'missing')]);

        expect(existsSync(join(root, 'Naruto'))).toBe(false);
        expect(existsSync(join(root, 'Bleach'))).toBe(true);
    });

    it('keeps going when one folder cannot be removed', () => {
        const remove = vi.fn((path: string) => {
            if (path === '/a') {
                throw new Error('EBUSY');
            }
        });
        removeDirectories(['/a', '/b'], remove);
        expect(remove.mock.calls).toEqual([['/a'], ['/b']]);
    });
});

describe('animeFolderName on Windows', () => {
    const win = { platform: 'win32' as const };

    it('keeps a normal title as it is', () => {
        expect(animeFolderName('Cyberpunk: Edgerunners', win)).toBe('Cyberpunk_ Edgerunners');
    });

    it('removes dots and spaces from the end, which Windows refuses', () => {
        expect(animeFolderName('Mr. Robot.', win)).toBe('Mr. Robot');
        expect(animeFolderName('Title ...  ', win)).toBe('Title');
        expect(animeFolderName('Title.', { platform: 'linux' })).toBe('Title.');
    });

    it.each(['CON', 'con', 'PRN', 'Aux', 'NUL', 'COM1', 'com9', 'LPT1', 'lpt9', 'CON.txt', 'nul.anything'])('prefixes the name Windows keeps for devices: %s', (name) => {
        expect(animeFolderName(name, win)).toBe(`_${name}`);
    });

    it.each(['CONSOLE', 'Console Wars', 'COM10', 'COM0', 'LPT', 'Anime CON', 'NULL'])('leaves a name that only looks like one: %s', (name) => {
        expect(animeFolderName(name, win)).toBe(name);
    });

    it('does not prefix those names on other systems', () => {
        expect(animeFolderName('CON', { platform: 'linux' })).toBe('CON');
    });

    it('uses the platform it runs on by default', () => {
        expect(animeFolderName('Mr. Robot.')).toBe(process.platform === 'win32' ? 'Mr. Robot' : 'Mr. Robot.');
    });

    it('can be shortened and never ends up empty', () => {
        expect(animeFolderName('abcdefghij', { maxLength: 4 })).toBe('abcd');
        expect(animeFolderName('...', win)).toBe('anime');
        expect(animeFolderName('  . ', win)).toBe('anime');
    });
});

describe('folderNameBudget', () => {
    it('is the usual length outside Windows, whatever the rest of the path is', () => {
        expect(folderNameBudget('/' + 'x'.repeat(300), 'Naruto', 'linux')).toBe(MAX_FOLDER_NAME_LENGTH);
    });

    it('is the usual length on Windows when the path is short', () => {
        expect(folderNameBudget('C:\\Anime', 'Naruto', 'win32')).toBe(MAX_FOLDER_NAME_LENGTH);
    });

    it('shrinks on Windows so the whole path of a file stays under the limit', () => {
        const base = `C:\\${'a'.repeat(120)}`;
        const title = 'Naruto';
        const budget = folderNameBudget(base, title, 'win32');
        expect(budget).toBeLessThan(MAX_FOLDER_NAME_LENGTH);
        const file = `${base}\\${'f'.repeat(budget)}\\Naruto Episode 999.mp4`;
        expect(file.length).toBeLessThanOrEqual(WINDOWS_PATH_BUDGET);
    });

    it('counts the long name ani-cli gives the files, which is the whole title', () => {
        const base = 'C:\\Users\\me\\Downloads\\Pullwave Anime';
        expect(folderNameBudget(base, 'A'.repeat(100), 'win32')).toBeLessThan(folderNameBudget(base, 'A', 'win32'));
    });

    it('never goes below the minimum', () => {
        expect(folderNameBudget(`C:\\${'a'.repeat(300)}`, 'Naruto', 'win32')).toBe(MIN_FOLDER_NAME_LENGTH);
    });

    it('uses this platform by default', () => {
        expect(folderNameBudget('/short', 'Naruto')).toBe(MAX_FOLDER_NAME_LENGTH);
    });
});

describe('Windows paths', () => {
    it('joins the base folder, using the settings or Downloads', () => {
        expect(animeBaseDirectory(DEFAULT_SETTINGS, 'C:\\Users\\me\\Downloads', 'win32')).toBe('C:\\Users\\me\\Downloads\\Pullwave Anime');
        expect(animeBaseDirectory({ ...DEFAULT_SETTINGS, animeDownloadDir: 'D:\\Anime' }, 'C:\\x', 'win32')).toBe('D:\\Anime');
    });

    it('makes the folder of an anime inside the base one, with the name that Windows accepts', () => {
        expect(animeDownloadDirectory('D:\\Anime', 'Re:Zero', 'win32')).toBe('D:\\Anime\\Re_Zero');
        expect(animeDownloadDirectory('D:\\Anime', 'NUL', 'win32')).toBe('D:\\Anime\\_NUL');
        expect(animeDownloadDirectory('/media/anime', 'Re:Zero', 'linux')).toBe('/media/anime/Re_Zero');
    });

    it('works out the folders to remove from Windows paths', () => {
        expect(animeFoldersToRemove('Naruto', ['D:\\Anime\\Naruto\\Naruto Episode 1.mp4', 'D:\\Anime\\Naruto\\Naruto Episode 2.mp4'], 'D:\\Anime', 'win32')).toEqual(['D:\\Anime\\Naruto']);
        expect(animeFoldersToRemove('Naruto', ['D:\\Videos\\Naruto Episode 1.mp4'], 'D:\\Anime', 'win32')).toEqual(['D:\\Anime\\Naruto']);
    });

    it('matches the name a folder was given when its path was long', () => {
        const base = `C:\\${'a'.repeat(150)}`;
        const folder = animeDownloadDirectory(base, 'B'.repeat(80), 'win32');
        expect(folder.length).toBeLessThan(`${base}\\${'B'.repeat(80)}`.length);
        expect(animeFoldersToRemove('B'.repeat(80), [`${folder}\\${'B'.repeat(80)} Episode 1.mp4`], base, 'win32')).toEqual([folder]);
    });

    it('never removes a folder that is not named after the anime', () => {
        expect(animeFoldersToRemove('Naruto', ['C:\\Users\\me\\Videos\\a.mp4'], 'D:\\Anime', 'win32')).toEqual(['D:\\Anime\\Naruto']);
    });
});
