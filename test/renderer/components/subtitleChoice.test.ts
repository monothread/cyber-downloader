// @vitest-environment jsdom
import {
    DEFAULT_OPTION_ID,
    importFailureKey,
    initialSubtitle,
    optionIdOf,
    optionsOf,
    readSubtitleChoice,
    saveSubtitleChoice
} from '@renderer/components/subtitleChoice';

const OPTIONS = [
    { id: 'default', label: 'English' },
    { id: 'subtitle-Japanese', label: 'Japanese' }
];

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('optionIdOf and optionsOf', () => {
    it('gives the default subtitle an id a <track> can have', () => {
        expect(DEFAULT_OPTION_ID).toBe('default');
        expect(optionIdOf({ id: '', label: 'English', kind: 'default' })).toBe('default');
        expect(optionIdOf({ id: 'subtitle-Japanese', label: 'Japanese', kind: 'source' })).toBe('subtitle-Japanese');
    });

    it('turns the tracks into options with their ids and labels', () => {
        expect(
            optionsOf([
                { id: '', label: 'English', kind: 'default' },
                { id: 'import-aula', label: 'aula', kind: 'imported' }
            ])
        ).toEqual([
            { id: 'default', label: 'English' },
            { id: 'import-aula', label: 'aula' }
        ]);
        expect(optionsOf([])).toEqual([]);
    });
});

describe('importFailureKey', () => {
    it.each([
        ['unsupported', 'anime.player.subtitleError.unsupported'],
        ['too-large', 'anime.player.subtitleError.too-large'],
        ['unreadable', 'anime.player.subtitleError.unreadable'],
        ['missing', 'anime.player.subtitleError.missing']
    ] as const)('gives the message of %s', (reason, key) => {
        expect(importFailureKey(reason)).toBe(key);
    });
});

describe('the choice of an episode', () => {
    it('has none until the viewer chooses', () => {
        expect(readSubtitleChoice(1)).toBeUndefined();
    });

    it('remembers an id and "off" for each episode', () => {
        saveSubtitleChoice(1, 'subtitle-Japanese');
        saveSubtitleChoice(2, null);
        expect(readSubtitleChoice(1)).toBe('subtitle-Japanese');
        expect(readSubtitleChoice(2)).toBeNull();
        expect(readSubtitleChoice(3)).toBeUndefined();
        expect(window.localStorage.getItem('pullwave-subtitle-1')).toBe('subtitle-Japanese');
        expect(window.localStorage.getItem('pullwave-subtitle-2')).toBe('off');
    });

    it('works without storage', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(readSubtitleChoice(1)).toBeUndefined();
        expect(() => {
            saveSubtitleChoice(1, 'default');
        }).not.toThrow();
    });
});

describe('initialSubtitle', () => {
    it('keeps what was chosen when it is still there', () => {
        expect(initialSubtitle(OPTIONS, 'subtitle-Japanese')).toBe('subtitle-Japanese');
    });

    it('keeps the subtitles off when they were turned off', () => {
        expect(initialSubtitle(OPTIONS, null)).toBeNull();
    });

    it('takes the first subtitle when nothing was chosen or the choice is gone', () => {
        expect(initialSubtitle(OPTIONS, undefined)).toBe('default');
        expect(initialSubtitle(OPTIONS, 'subtitle-Korean')).toBe('default');
    });

    it('has nothing to show without subtitles', () => {
        expect(initialSubtitle([], undefined)).toBeNull();
        expect(initialSubtitle([], 'default')).toBeNull();
    });
});
