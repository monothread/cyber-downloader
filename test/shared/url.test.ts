import { isValidHttpUrl, splitUrls } from '@shared/url';

describe('isValidHttpUrl', () => {
    it('accepts http and https URLs', () => {
        expect(isValidHttpUrl('http://example.com/a')).toBe(true);
        expect(isValidHttpUrl('https://example.com/watch?v=1')).toBe(true);
    });

    it('accepts URLs surrounded by whitespace', () => {
        expect(isValidHttpUrl('  https://example.com  ')).toBe(true);
    });

    it('rejects other protocols', () => {
        expect(isValidHttpUrl('ftp://example.com')).toBe(false);
        expect(isValidHttpUrl('file:///etc/passwd')).toBe(false);
        expect(isValidHttpUrl('javascript:alert(1)')).toBe(false);
    });

    it('rejects invalid and empty values', () => {
        expect(isValidHttpUrl('not a url')).toBe(false);
        expect(isValidHttpUrl('')).toBe(false);
    });
});

describe('splitUrls', () => {
    it('splits on any whitespace and drops empty tokens', () => {
        expect(splitUrls(' https://a.com \n\n https://b.com\thttps://c.com ')).toEqual([
            'https://a.com',
            'https://b.com',
            'https://c.com'
        ]);
    });

    it('returns an empty array for blank input', () => {
        expect(splitUrls('   \n ')).toEqual([]);
    });
});
