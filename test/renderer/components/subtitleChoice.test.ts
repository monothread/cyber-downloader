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

    describe('with the language of the app', () => {
        const TRACKS = [
            { id: '', label: 'English', kind: 'default' as const },
            { id: 'subtitle-Portuguese (- Portuguese(Brazil))', label: 'Portuguese (- Portuguese(Brazil))', kind: 'source' as const },
            { id: 'subtitle-Spanish', label: 'Spanish', kind: 'source' as const },
            { id: 'import-English', label: 'English', kind: 'imported' as const }
        ];

        it('writes the names of the subtitles of the source in it, and keeps the ids', () => {
            expect(optionsOf(TRACKS, 'pt')).toEqual([
                { id: 'default', label: 'Inglês' },
                { id: 'subtitle-Portuguese (- Portuguese(Brazil))', label: 'Português (Brasil)' },
                { id: 'subtitle-Spanish', label: 'Espanhol' },
                { id: 'import-English', label: 'English' }
            ]);
        });

        it('does not touch the name of a subtitle the user loaded, even when it is written like a language', () => {
            expect(optionsOf([{ id: 'import-Spanish', label: 'Spanish', kind: 'imported' }], 'pt')).toEqual([{ id: 'import-Spanish', label: 'Spanish' }]);
        });

        it('keeps the name the placeholder of the player and the default subtitle have when they are not a language', () => {
            expect(
                optionsOf(
                    [
                        { id: '', label: 'Subtitles', kind: 'default' },
                        { id: '', label: 'Default', kind: 'default' }
                    ],
                    'es'
                )
            ).toEqual([
                { id: 'default', label: 'Subtitles' },
                { id: 'default', label: 'Default' }
            ]);
        });

        it('tells two subtitles apart that would be written the same', () => {
            expect(
                optionsOf(
                    [
                        { id: 'subtitle-Portuguese (- Portuguese(Brazil))', label: 'Portuguese (- Portuguese(Brazil))', kind: 'source' },
                        { id: 'subtitle-Portuguese (Brazil)', label: 'Portuguese (Brazil)', kind: 'source' }
                    ],
                    'pt'
                ).map((option) => {
                    return option.label;
                })
            ).toEqual(['Português (Brasil)', 'Portuguese (Brazil)']);
        });
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
