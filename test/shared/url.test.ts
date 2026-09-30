import { isValidHttpUrl } from '@shared/url';

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
