import { clampCheckSeconds, FOLLOW_SETTING, hasOptions, SWITCH_OFF, SWITCH_ON, switchChoice, switchValue, withOption } from '@renderer/components/downloadOptions';

describe('hasOptions', () => {
    it('is false without options and true with any', () => {
        expect(hasOptions({})).toBe(false);
        expect(hasOptions({ audioOnly: false })).toBe(true);
        expect(hasOptions({ maxResolution: '720', waitForLive: true })).toBe(true);
    });
});

describe('switchChoice and switchValue', () => {
    it('map a missing value to following the setting', () => {
        expect(switchChoice(undefined)).toBe(FOLLOW_SETTING);
        expect(switchValue(FOLLOW_SETTING)).toBeUndefined();
    });

    it('map true and false to on and off and back', () => {
        expect(switchChoice(true)).toBe(SWITCH_ON);
        expect(switchChoice(false)).toBe(SWITCH_OFF);
        expect(switchValue(SWITCH_ON)).toBe(true);
        expect(switchValue(SWITCH_OFF)).toBe(false);
    });
});

describe('withOption', () => {
    it('adds an option without changing the others or the original', () => {
        const original = { maxResolution: '720' as const };
        const next = withOption(original, 'audioOnly', true);
        expect(next).toEqual({ maxResolution: '720', audioOnly: true });
        expect(original).toEqual({ maxResolution: '720' });
    });

    it('replaces an option', () => {
        expect(withOption({ audioFormat: 'mp3' }, 'audioFormat', 'opus')).toEqual({ audioFormat: 'opus' });
    });

    it('keeps false, because it is a choice', () => {
        expect(withOption({}, 'verifyLiveEnd', false)).toEqual({ verifyLiveEnd: false });
    });

    it('drops an option that goes back to following the setting', () => {
        expect(withOption({ maxResolution: '720', audioOnly: true }, 'maxResolution', undefined)).toEqual({ audioOnly: true });
        expect(withOption({}, 'maxResolution', undefined)).toEqual({});
    });
});

describe('clampCheckSeconds', () => {
    it.each([
        [0, 1],
        [1, 1],
        [10, 10],
        [120, 120],
        [999, 120],
        [-4, 1],
        [4.4, 4],
        [4.6, 5]
    ])('turns %j into %j', (value, expected) => {
        expect(clampCheckSeconds(value)).toBe(expected);
    });
});
