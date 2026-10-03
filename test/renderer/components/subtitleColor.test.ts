// @vitest-environment jsdom
import {
    applySubtitleChoice,
    DEFAULT_SUBTITLE_BACKGROUND,
    DEFAULT_SUBTITLE_COLOR,
    isSubtitleBackgroundId,
    isSubtitleColorId,
    readSubtitleBackground,
    readSubtitleColor,
    saveSubtitleBackground,
    saveSubtitleColor,
    SUBTITLE_BACKGROUND_VARIABLE,
    SUBTITLE_BACKGROUNDS,
    SUBTITLE_COLOR_VARIABLE,
    SUBTITLE_COLORS
} from '@renderer/components/subtitleColor';

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('choices', () => {
    it('leaves the theme in charge by default', () => {
        expect(DEFAULT_SUBTITLE_COLOR).toBe('theme');
        expect(DEFAULT_SUBTITLE_BACKGROUND).toBe('dim');
        expect(SUBTITLE_COLORS[0]).toEqual({ id: 'theme', value: null, labelKey: 'anime.player.subtitleColorTheme' });
        expect(SUBTITLE_BACKGROUNDS[0]).toEqual({ id: 'dim', value: null, labelKey: 'anime.player.subtitleBackgroundDim' });
    });

    it('lists every text color and background', () => {
        expect(SUBTITLE_COLORS.map((choice) => {
            return [choice.id, choice.value];
        })).toEqual([
            ['theme', null],
            ['white', '#ffffff'],
            ['yellow', '#ffeb3b'],
            ['cyan', '#4dd0e1'],
            ['green', '#69f0ae']
        ]);
        expect(SUBTITLE_BACKGROUNDS.map((choice) => {
            return [choice.id, choice.value];
        })).toEqual([
            ['dim', null],
            ['solid', '#000000'],
            ['none', 'transparent']
        ]);
    });
});

describe('isSubtitleColorId and isSubtitleBackgroundId', () => {
    it.each([['theme', true], ['yellow', true], ['pink', false], ['dim', false], ['', false]])('tells if "%s" is a text color: %s', (id, expected) => {
        expect(isSubtitleColorId(id)).toBe(expected);
    });

    it.each([['dim', true], ['none', true], ['solid', true], ['yellow', false], ['', false]])('tells if "%s" is a background: %s', (id, expected) => {
        expect(isSubtitleBackgroundId(id)).toBe(expected);
    });
});

describe('readSubtitleColor and readSubtitleBackground', () => {
    it('give the defaults when nothing was saved', () => {
        expect(readSubtitleColor()).toBe('theme');
        expect(readSubtitleBackground()).toBe('dim');
    });

    it('give back what was saved', () => {
        saveSubtitleColor('cyan');
        saveSubtitleBackground('solid');
        expect(window.localStorage.getItem('pullwave-subtitle-color')).toBe('cyan');
        expect(window.localStorage.getItem('pullwave-subtitle-background')).toBe('solid');
        expect(readSubtitleColor()).toBe('cyan');
        expect(readSubtitleBackground()).toBe('solid');
    });

    it('ignore a value that is not a choice', () => {
        window.localStorage.setItem('pullwave-subtitle-color', 'pink');
        window.localStorage.setItem('pullwave-subtitle-background', 'yellow');
        expect(readSubtitleColor()).toBe('theme');
        expect(readSubtitleBackground()).toBe('dim');
    });

    it('give the defaults when the storage cannot be read', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(readSubtitleColor()).toBe('theme');
        expect(readSubtitleBackground()).toBe('dim');
    });
});

describe('saveSubtitleColor and saveSubtitleBackground', () => {
    it('do not fail when the storage cannot be written', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('full');
        });
        expect(() => {
            saveSubtitleColor('white');
            saveSubtitleBackground('none');
        }).not.toThrow();
    });
});

describe('applySubtitleChoice', () => {
    it('sets the variable of a choice that has a value', () => {
        const element = document.createElement('video');
        applySubtitleChoice(element, SUBTITLE_COLOR_VARIABLE, SUBTITLE_COLORS, 'white');
        applySubtitleChoice(element, SUBTITLE_BACKGROUND_VARIABLE, SUBTITLE_BACKGROUNDS, 'none');
        expect(element.style.getPropertyValue('--subtitle-color')).toBe('#ffffff');
        expect(element.style.getPropertyValue('--subtitle-background')).toBe('transparent');
    });

    it('clears the variable of a choice that leaves the theme in charge', () => {
        const element = document.createElement('video');
        applySubtitleChoice(element, SUBTITLE_COLOR_VARIABLE, SUBTITLE_COLORS, 'green');
        applySubtitleChoice(element, SUBTITLE_COLOR_VARIABLE, SUBTITLE_COLORS, 'theme');
        expect(element.style.getPropertyValue('--subtitle-color')).toBe('');
    });
});
