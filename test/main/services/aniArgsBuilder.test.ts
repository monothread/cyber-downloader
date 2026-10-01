import {
    buildDownloadArgs,
    buildEpisodesArgs,
    buildSearchArgs,
    DEFAULT_ANIME_QUALITY,
    isValidEpisode,
    isValidIndex,
    isValidQuality,
    sanitizeQuery,
    validateDownloadRequest,
    type AniDownloadRequest
} from '@main/services/aniArgsBuilder';

const REQUEST: AniDownloadRequest = { query: 'cyberpunk edgerunners', index: 1, episode: '3', quality: '720p' };

describe('sanitizeQuery', () => {
    it('keeps letters, digits and the usual punctuation', () => {
        expect(sanitizeQuery("Re:Zero kara Hajimeru Isekai Seikatsu, Mob Psycho 100! It's")).toBe(
            "Re:Zero kara Hajimeru Isekai Seikatsu, Mob Psycho 100! It's"
        );
    });

    it('keeps accented and non-latin letters', () => {
        expect(sanitizeQuery('Pokémon 進撃の巨人')).toBe('Pokémon 進撃の巨人');
    });

    it('drops the characters that would break the address ani-cli builds', () => {
        expect(sanitizeQuery('naruto&mode=dub#x?y=z/../')).toBe('naruto mode dub x y z ..');
    });

    it('removes leading dashes so a word is never read as a flag', () => {
        expect(sanitizeQuery('-d -U --dub naruto')).toBe('d U dub naruto');
    });

    it('keeps dashes inside a word', () => {
        expect(sanitizeQuery('Spy-x-Family')).toBe('Spy-x-Family');
    });

    it('collapses whitespace and trims', () => {
        expect(sanitizeQuery('  one \t\n  piece  ')).toBe('one piece');
    });

    it('returns an empty string when nothing is left', () => {
        expect(sanitizeQuery('&&& ###')).toBe('');
        expect(sanitizeQuery('')).toBe('');
    });
});

describe('validators', () => {
    it('accepts whole and decimal episode numbers only', () => {
        expect(['1', '12', '1000', '5.5'].map(isValidEpisode)).toEqual([true, true, true, true]);
        expect(['', 'a', '-1', '1-3', '1 2', '1.', '.5', '1;rm'].map(isValidEpisode)).toEqual([false, false, false, false, false, false, false, false]);
    });

    it('accepts best, worst and pixel heights', () => {
        expect(['best', 'worst', 'BEST', '720', '720p', '1080p', '2160'].map(isValidQuality)).toEqual([true, true, true, true, true, true, true]);
        expect(['', '72', 'hd', '720px', '-q', '720p;ls'].map(isValidQuality)).toEqual([false, false, false, false, false, false]);
    });

    it('accepts positive whole positions only', () => {
        expect([1, 2, 99].map(isValidIndex)).toEqual([true, true, true]);
        expect([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY].map(isValidIndex)).toEqual([false, false, false, false, false]);
    });

    it('defaults to the best quality', () => {
        expect(DEFAULT_ANIME_QUALITY).toBe('best');
    });
});

describe('argument builders', () => {
    it('builds the search arguments with the cleaned query', () => {
        expect(buildSearchArgs('  -d  cyberpunk &edgerunners ')).toEqual(['d cyberpunk edgerunners']);
    });

    it('builds the episode listing arguments', () => {
        expect(buildEpisodesArgs('cyberpunk edgerunners', 2)).toEqual(['-S', '2', 'cyberpunk edgerunners']);
    });

    it('builds the download arguments', () => {
        expect(buildDownloadArgs(REQUEST)).toEqual(['-d', '-S', '1', '-e', '3', '-q', '720p', 'cyberpunk edgerunners']);
    });

    it('cleans the query of a download too', () => {
        expect(buildDownloadArgs({ ...REQUEST, query: '-U cyberpunk' })).toEqual(['-d', '-S', '1', '-e', '3', '-q', '720p', 'U cyberpunk']);
    });
});

describe('validateDownloadRequest', () => {
    it('accepts a valid request', () => {
        expect(validateDownloadRequest(REQUEST)).toBeNull();
    });

    it('rejects an empty name', () => {
        expect(validateDownloadRequest({ ...REQUEST, query: '&&&' })).toBe('The anime name is empty.');
    });

    it('rejects a bad position', () => {
        expect(validateDownloadRequest({ ...REQUEST, index: 0 })).toBe('Invalid result position: 0');
    });

    it('rejects a bad episode', () => {
        expect(validateDownloadRequest({ ...REQUEST, episode: '1-3' })).toBe('Invalid episode: 1-3');
    });

    it('rejects a bad quality', () => {
        expect(validateDownloadRequest({ ...REQUEST, quality: '--dub' })).toBe('Invalid quality: --dub');
    });
});
