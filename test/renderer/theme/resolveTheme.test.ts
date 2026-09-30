// @vitest-environment jsdom
import {
    applyTheme,
    DARK_SCHEME_QUERY,
    rememberedTheme,
    rememberTheme,
    resolveTheme,
    systemPrefersDark,
    THEME_STORAGE_KEY
} from '@renderer/theme/resolveTheme';

function mockSystem(dark: boolean): ReturnType<typeof vi.fn> {
    const matchMedia = vi.fn((query: string) => {
        return { media: query, matches: dark };
    });
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: matchMedia });
    return matchMedia;
}

afterEach(() => {
    Reflect.deleteProperty(window, 'matchMedia');
    window.localStorage.clear();
    delete document.documentElement.dataset.theme;
    vi.restoreAllMocks();
});

describe('resolveTheme', () => {
    it.each([
        ['device', true, 'dark'],
        ['device', false, 'light'],
        ['cyberpunk', true, 'cyberpunk'],
        ['cyberpunk', false, 'cyberpunk'],
        ['dark', false, 'dark'],
        ['light', true, 'light']
    ] as const)('resolves %s with a system that prefers dark = %s to %s', (theme, dark, expected) => {
        expect(resolveTheme(theme, dark)).toBe(expected);
    });
});

describe('systemPrefersDark', () => {
    it('asks the dark color scheme query', () => {
        const matchMedia = mockSystem(true);
        expect(systemPrefersDark()).toBe(true);
        expect(matchMedia).toHaveBeenCalledWith(DARK_SCHEME_QUERY);
        expect(DARK_SCHEME_QUERY).toBe('(prefers-color-scheme: dark)');
    });

    it('is false for a light system', () => {
        mockSystem(false);
        expect(systemPrefersDark()).toBe(false);
    });

    it('is false when matchMedia does not exist', () => {
        expect(systemPrefersDark()).toBe(false);
    });
});

describe('applyTheme', () => {
    it('puts the resolved theme on the document', () => {
        mockSystem(true);
        applyTheme('device');
        expect(document.documentElement.dataset.theme).toBe('dark');
        applyTheme('light');
        expect(document.documentElement.dataset.theme).toBe('light');
        applyTheme('cyberpunk');
        expect(document.documentElement.dataset.theme).toBe('cyberpunk');
    });
});

describe('remembering the theme', () => {
    it('stores the chosen theme and reads it back', () => {
        rememberTheme('light');
        expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
        expect(rememberedTheme()).toBe('light');
    });

    it('falls back to device when nothing or something unknown is stored', () => {
        expect(rememberedTheme()).toBe('device');
        window.localStorage.setItem(THEME_STORAGE_KEY, 'solarized');
        expect(rememberedTheme()).toBe('device');
    });

    it('does not fail when the storage cannot be used', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(() => {
            rememberTheme('dark');
        }).not.toThrow();
        expect(rememberedTheme()).toBe('device');
    });
});
