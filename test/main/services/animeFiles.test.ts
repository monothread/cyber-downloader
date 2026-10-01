import { DEFAULT_SETTINGS } from '@shared/constants';
import {
    animeBaseDirectory,
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
        expect(animeFolderName('A<B>C:D"E/F\\G|H?I*J')).toBe('A_B_C_D_E_F_G_H_I_J');
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
        expect(animeBaseDirectory({ ...DEFAULT_SETTINGS, animeDownloadDir: '/media/anime' }, '/home/me/Downloads')).toBe('/media/anime');
    });

    it('falls back to a folder inside Downloads', () => {
        expect(DEFAULT_ANIME_FOLDER).toBe('Pullwave Anime');
        expect(animeBaseDirectory(DEFAULT_SETTINGS, '/home/me/Downloads')).toBe('/home/me/Downloads/Pullwave Anime');
    });
});

describe('animeFoldersToRemove', () => {
    it('gives the folder of the files and the one a download would use now, without repeating', () => {
        expect(animeFoldersToRemove('Naruto', ['/old/Naruto/a.mp4', '/old/Naruto/b.mp4'], '/new')).toEqual(['/old/Naruto', '/new/Naruto']);
        expect(animeFoldersToRemove('Naruto', ['/lib/Naruto/a.mp4'], '/lib')).toEqual(['/lib/Naruto']);
    });

    it('gives the folder a download would use even when nothing was downloaded', () => {
        expect(animeFoldersToRemove('Naruto', [], '/lib')).toEqual(['/lib/Naruto']);
    });

    it('never gives a folder that is not named after the anime', () => {
        expect(animeFoldersToRemove('Naruto', ['/home/me/Videos/a.mp4', '/lib/Naruto/b.mp4'], '/lib')).toEqual(['/lib/Naruto']);
        expect(animeFoldersToRemove('Naruto', ['/home/me/Videos/a.mp4'], '/lib')).toEqual(['/lib/Naruto']);
    });

    it('matches the name the folder was created with', () => {
        expect(animeFoldersToRemove('Re:Zero', ['/lib/Re_Zero/a.mp4'], '/lib')).toEqual(['/lib/Re_Zero']);
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
