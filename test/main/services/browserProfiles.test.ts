import { parseChromiumProfileNames, parseFirefoxProfiles } from '@main/services/browserProfiles';

describe('parseChromiumProfileNames', () => {
    it('maps each profile folder to the name the user gave it', () => {
        const text = JSON.stringify({ profile: { info_cache: { Default: { name: 'Personal' }, 'Profile 1': { name: 'Work', other: 1 } } } });
        expect(parseChromiumProfileNames(text)).toEqual({ Default: 'Personal', 'Profile 1': 'Work' });
    });

    it('skips profiles without a usable name', () => {
        const text = JSON.stringify({ profile: { info_cache: { Default: { name: '' }, 'Profile 1': {}, 'Profile 2': 'x', 'Profile 3': { name: 7 } } } });
        expect(parseChromiumProfileNames(text)).toEqual({});
    });

    it.each([
        ['a missing file', null],
        ['invalid JSON', '{ nope'],
        ['a file without profiles', '{}'],
        ['a list instead of an object', '[]'],
        ['an info_cache that is not an object', '{"profile":{"info_cache":[1]}}']
    ])('returns no names for %s', (_case, text) => {
        expect(parseChromiumProfileNames(text)).toEqual({});
    });
});

describe('parseFirefoxProfiles', () => {
    it('reads the name and the path of every [ProfileN] section', () => {
        const ini = [
            '[General]',
            'StartWithLastProfile=1',
            '',
            '[Profile0]',
            'Name=default-release',
            'IsRelative=1',
            'Path=mjan87q3.default-release',
            '',
            '[Install4F96D1932A9F858E]',
            'Default=mjan87q3.default-release',
            '',
            '[Profile1]',
            'Name=default',
            'IsRelative=1',
            'Path=ce8zm06m.default',
            'Default=1'
        ].join('\n');
        expect(parseFirefoxProfiles(ini)).toEqual([
            { name: 'default-release', path: 'mjan87q3.default-release' },
            { name: 'default', path: 'ce8zm06m.default' }
        ]);
    });

    it('accepts Windows line endings and spaces around the sign', () => {
        expect(parseFirefoxProfiles('[Profile0]\r\nName = work\r\nIsRelative = 1\r\nPath = Profiles/a.default\r\n')).toEqual([
            { name: 'work', path: 'Profiles/a.default' }
        ]);
    });

    it('uses the path as the name when a profile has none', () => {
        expect(parseFirefoxProfiles('[Profile0]\nPath=abc.default')).toEqual([{ name: 'abc.default', path: 'abc.default' }]);
    });

    it('leaves out profiles stored outside the Firefox folder and sections without a path', () => {
        const ini = '[Profile0]\nName=far\nIsRelative=0\nPath=/data/profile\n[Profile1]\nName=empty';
        expect(parseFirefoxProfiles(ini)).toEqual([]);
    });

    it('returns nothing for a missing or empty file', () => {
        expect(parseFirefoxProfiles(null)).toEqual([]);
        expect(parseFirefoxProfiles('')).toEqual([]);
    });
});
