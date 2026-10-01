import { compareVersions, parseAniCliVersion } from '@main/services/aniVersion';

describe('parseAniCliVersion', () => {
    it('reads the version line of the script', () => {
        expect(parseAniCliVersion('#!/bin/sh\n\nversion_number="5.1.4"\n\n# more')).toBe('5.1.4');
    });

    it('takes the first one and ignores indented or commented ones', () => {
        expect(parseAniCliVersion('  version_number="9.9.9"\n# version_number="8.8.8"\nversion_number="5.1.4"\nversion_number="1.0"')).toBe('5.1.4');
    });

    it('gives null when there is none', () => {
        expect(parseAniCliVersion('')).toBeNull();
        expect(parseAniCliVersion('version_number=5.1.4')).toBeNull();
        expect(parseAniCliVersion('echo version_number="5.1.4"')).toBeNull();
    });
});

describe('compareVersions', () => {
    it('is zero for the same version, also with a different number of parts', () => {
        expect(compareVersions('5.1.4', '5.1.4')).toBe(0);
        expect(compareVersions('5.1', '5.1.0')).toBe(0);
    });

    it('is positive for a newer version and negative for an older one', () => {
        expect(compareVersions('5.1.5', '5.1.4')).toBeGreaterThan(0);
        expect(compareVersions('5.1.4', '5.1.5')).toBeLessThan(0);
        expect(compareVersions('6.0', '5.9.9')).toBeGreaterThan(0);
        expect(compareVersions('5.1', '5.1.1')).toBeLessThan(0);
    });

    it('compares number by number, not as text', () => {
        expect(compareVersions('5.10', '5.9')).toBeGreaterThan(0);
        expect(compareVersions('5.9', '5.10')).toBeLessThan(0);
    });

    it('counts a part that is not a number as zero', () => {
        expect(compareVersions('5.1.x', '5.1.0')).toBe(0);
        expect(compareVersions('5.1.x', '5.1.1')).toBeLessThan(0);
        expect(compareVersions('abc', '0')).toBe(0);
    });
});
