// @vitest-environment jsdom
import {
    clampSubtitleScale,
    DEFAULT_SUBTITLE_SCALE,
    MAX_SUBTITLE_SCALE,
    MIN_SUBTITLE_SCALE,
    readSubtitleScale,
    saveSubtitleScale,
    scalePercent,
    stepSubtitleScale,
    SUBTITLE_SCALE_STEP
} from '@renderer/components/subtitleScale';

beforeEach(() => {
    window.localStorage.clear();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('limits', () => {
    it('go from half the normal size to three times it, in steps of a quarter', () => {
        expect(DEFAULT_SUBTITLE_SCALE).toBe(1);
        expect(MIN_SUBTITLE_SCALE).toBe(0.5);
        expect(MAX_SUBTITLE_SCALE).toBe(3);
        expect(SUBTITLE_SCALE_STEP).toBe(0.25);
    });
});

describe('clampSubtitleScale', () => {
    it.each([
        [0.1, 0.5],
        [0.5, 0.5],
        [1.7, 1.7],
        [3, 3],
        [10, 3]
    ])('turns %s into %s', (scale, expected) => {
        expect(clampSubtitleScale(scale)).toBe(expected);
    });
});

describe('stepSubtitleScale', () => {
    it('makes the subtitles a step bigger or smaller', () => {
        expect(stepSubtitleScale(1, 1)).toBe(1.25);
        expect(stepSubtitleScale(1, -1)).toBe(0.75);
        expect(stepSubtitleScale(2.75, 1)).toBe(3);
    });

    it('never goes past the limits', () => {
        expect(stepSubtitleScale(3, 1)).toBe(3);
        expect(stepSubtitleScale(0.5, -1)).toBe(0.5);
    });

    it('lands on a step when the stored value is between two', () => {
        expect(stepSubtitleScale(1.1, 1)).toBe(1.25);
        expect(stepSubtitleScale(1.1, -1)).toBe(0.75);
    });
});

describe('the size that is remembered', () => {
    it('is the normal size until the viewer changes it', () => {
        expect(readSubtitleScale()).toBe(1);
    });

    it('is saved and read back', () => {
        saveSubtitleScale(1.5);
        expect(window.localStorage.getItem('pullwave-subtitle-scale')).toBe('1.5');
        expect(readSubtitleScale()).toBe(1.5);
    });

    it('keeps a stored value inside the limits and ignores what is not a size', () => {
        window.localStorage.setItem('pullwave-subtitle-scale', '9');
        expect(readSubtitleScale()).toBe(3);
        window.localStorage.setItem('pullwave-subtitle-scale', '0.01');
        expect(readSubtitleScale()).toBe(0.5);
        window.localStorage.setItem('pullwave-subtitle-scale', 'big');
        expect(readSubtitleScale()).toBe(1);
        window.localStorage.setItem('pullwave-subtitle-scale', '0');
        expect(readSubtitleScale()).toBe(1);
        window.localStorage.setItem('pullwave-subtitle-scale', '-2');
        expect(readSubtitleScale()).toBe(1);
    });

    it('works without storage', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        expect(readSubtitleScale()).toBe(1);
        expect(() => {
            saveSubtitleScale(2);
        }).not.toThrow();
    });
});

describe('scalePercent', () => {
    it.each([
        [1, '100%'],
        [0.5, '50%'],
        [1.25, '125%'],
        [3, '300%']
    ])('writes %s as %s', (scale, text) => {
        expect(scalePercent(scale)).toBe(text);
    });
});
