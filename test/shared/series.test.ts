import { cleanSeasonName, cleanSeriesName, foldSeries, isValidSeason, MAX_SEASON, MAX_SEASON_NAME_LENGTH, MAX_SERIES_LENGTH, sameSeries, suggestSeries } from '@shared/series';

describe('constants', () => {
    it('allows a name of 100 characters and seasons from 1 to 99', () => {
        expect(MAX_SERIES_LENGTH).toBe(100);
        expect(MAX_SEASON).toBe(99);
        expect(MAX_SEASON_NAME_LENGTH).toBe(60);
    });
});

describe('suggestSeries', () => {
    it.each([
        ["Frieren: Beyond Journey's End Season 2", "Frieren: Beyond Journey's End", 2],
        ['Sousou no Frieren 3rd Season', 'Sousou no Frieren', 3],
        ['Sousou no Frieren 2nd Season', 'Sousou no Frieren', 2],
        ['Sousou no Frieren 1st Season', 'Sousou no Frieren', 1],
        ['Sousou no Frieren 11th Season', 'Sousou no Frieren', 11],
        ['Attack on Titan Season 4', 'Attack on Titan', 4],
        ['Attack on Titan - Season 3', 'Attack on Titan', 3],
        ['Re:Zero: Season 2', 'Re:Zero', 2],
        ['Mushoku Tensei Part 2', 'Mushoku Tensei', 2],
        ['Mushoku Tensei Cour 2', 'Mushoku Tensei', 2],
        ['Overlord Second Season', 'Overlord', 2],
        ['Overlord Third Season', 'Overlord', 3],
        ['Overlord Tenth Season', 'Overlord', 10],
        ['Attack on Titan Final Season', 'Attack on Titan', 1],
        ['  Spaced  Season 5  ', 'Spaced', 5],
        ['SEASON NAMES SEASON 2', 'SEASON NAMES', 2]
    ])('suggests "%s" as %s, season %s', (title, series, season) => {
        expect(suggestSeries(title)).toEqual({ series, season });
    });

    it.each([
        ['Bleach', 'Bleach'],
        ['Bleach: Thousand-Year Blood War Arc', 'Bleach: Thousand-Year Blood War Arc'],
        ['Bleach: Thousand-Year Blood War - The Separation', 'Bleach: Thousand-Year Blood War - The Separation'],
        ['Frieren: Beyond Journey\'s End', 'Frieren: Beyond Journey\'s End'],
        ['Sousou no Frieren - Marumaru no Mahou (Mini Anime)', 'Sousou no Frieren - Marumaru no Mahou (Mini Anime)'],
        ['Mob Psycho 100', 'Mob Psycho 100'],
        ['Season 2', 'Season 2'],
        ['', '']
    ])('keeps "%s" as it is, as season 1', (title, series) => {
        expect(suggestSeries(title)).toEqual({ series, season: 1 });
    });

    it('does not take a season number that is out of range', () => {
        expect(suggestSeries('Naruto Season 100')).toEqual({ series: 'Naruto Season 100', season: 1 });
        expect(suggestSeries('Naruto Season 0')).toEqual({ series: 'Naruto Season 0', season: 1 });
    });

    it('does not take a marker from the middle of a title', () => {
        expect(suggestSeries('Season 2 of Something')).toEqual({ series: 'Season 2 of Something', season: 1 });
        expect(suggestSeries('Part 2 Memories')).toEqual({ series: 'Part 2 Memories', season: 1 });
    });
});

describe('foldSeries and sameSeries', () => {
    it('ignores the case, the accents and the spaces', () => {
        expect(foldSeries('  Pokémon   Journeys ')).toBe('pokemon journeys');
        expect(sameSeries('Pokémon', 'POKEMON')).toBe(true);
        expect(sameSeries('Frieren:  Beyond', 'frieren: beyond ')).toBe(true);
    });

    it('tells different series apart', () => {
        expect(sameSeries('Bleach', 'Bleach: Thousand-Year Blood War')).toBe(false);
        expect(sameSeries('', 'a')).toBe(false);
    });
});

describe('cleanSeriesName', () => {
    it('trims and joins the spaces', () => {
        expect(cleanSeriesName('  Frieren   Beyond  ')).toBe('Frieren Beyond');
    });

    it('refuses an empty name and one that is too long, and accepts the longest one', () => {
        expect(cleanSeriesName('   ')).toBeNull();
        expect(cleanSeriesName('')).toBeNull();
        expect(cleanSeriesName('a'.repeat(100))).toBe('a'.repeat(100));
        expect(cleanSeriesName('a'.repeat(101))).toBeNull();
    });
});

describe('isValidSeason', () => {
    it.each([1, 2, 50, 99])('accepts %s', (season) => {
        expect(isValidSeason(season)).toBe(true);
    });

    it.each([0, -1, 100, 1.5, Number.NaN, '2', null, undefined, {}])('refuses %s', (season) => {
        expect(isValidSeason(season)).toBe(false);
    });
});

describe('cleanSeasonName', () => {
    it('trims and joins the spaces', () => {
        expect(cleanSeasonName('  Thousand-Year   Blood War ')).toBe('Thousand-Year Blood War');
    });

    it('is none for an empty name, and refuses one that is too long', () => {
        expect(cleanSeasonName('')).toBeNull();
        expect(cleanSeasonName('   ')).toBeNull();
        expect(cleanSeasonName('a'.repeat(60))).toBe('a'.repeat(60));
        expect(cleanSeasonName('a'.repeat(61))).toBeUndefined();
    });
});
