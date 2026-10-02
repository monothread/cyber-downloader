// An anime that has several seasons is several entries in the source ("Frieren", "Frieren Season 2", "Sousou no Frieren 3rd
// Season"...). The user joins them by giving each one a series name and a season number; this only suggests the values.
export const MAX_SERIES_LENGTH = 100;
export const MAX_SEASON = 99;
export const MAX_SEASON_NAME_LENGTH = 60;

export interface SeriesChoice {
    series: string;
    // The place of the anime in the series.
    season: number;
    // The name it is shown with in the series (empty: none).
    seasonName?: string;
}

const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
const NUMBER = '(\\d{1,2})';
// "Season 2", "2nd Season", "Second Season", "Part 2", "Final Season", at the end of the title (or before a bracket).
const MARKERS: ReadonlyArray<{ pattern: RegExp; season: (match: RegExpExecArray) => number | null }> = [
    {
        pattern: new RegExp(`[\\s:\\-–]+(?:season|part|cour)\\s*${NUMBER}\\s*$`, 'i'),
        season: (match) => {
            return Number(match[1]);
        }
    },
    {
        pattern: new RegExp(`[\\s:\\-–]+${NUMBER}(?:st|nd|rd|th)\\s+(?:season|part|cour)\\s*$`, 'i'),
        season: (match) => {
            return Number(match[1]);
        }
    },
    {
        pattern: /[\s:\-–]+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:season|part|cour)\s*$/i,
        season: (match) => {
            return ORDINALS[(match[1] as string).toLowerCase()] ?? null;
        }
    },
    {
        pattern: /[\s:\-–]+final\s+season\s*$/i,
        season: () => {
            return null;
        }
    }
];

// The series and the season a title suggests: what follows a season marker is taken off, and the season is the number in the
// marker (1 when there is none). It is only a suggestion: the user can change both.
export function suggestSeries(title: string): SeriesChoice {
    const cleaned = title.trim();
    for (const marker of MARKERS) {
        const match = marker.pattern.exec(cleaned);
        if (match) {
            const base = cleaned.slice(0, match.index).trim();
            const season = marker.season(match);
            if (base.length > 0 && season !== null && season >= 1 && season <= MAX_SEASON) {
                return { series: base, season };
            }
            if (base.length > 0 && season === null) {
                return { series: base, season: 1 };
            }
        }
    }
    return { series: cleaned, season: 1 };
}

// Series names are compared without regard to case, accents or spaces around them.
export function foldSeries(name: string): string {
    return name
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

export function sameSeries(first: string, second: string): boolean {
    return foldSeries(first) === foldSeries(second);
}

// The series name as it can be kept: trimmed, in one piece, not empty and not too long; null when it cannot be.
export function cleanSeriesName(name: string): string | null {
    const cleaned = name.replace(/\s+/g, ' ').trim();
    return cleaned.length > 0 && cleaned.length <= MAX_SERIES_LENGTH ? cleaned : null;
}

// The name an anime is shown with inside its series (instead of "SEASON 2"): trimmed and in one piece. Empty means none (null);
// undefined when it is too long to be kept.
export function cleanSeasonName(name: string): string | null | undefined {
    const cleaned = name.replace(/\s+/g, ' ').trim();
    if (cleaned.length === 0) {
        return null;
    }
    return cleaned.length <= MAX_SEASON_NAME_LENGTH ? cleaned : undefined;
}

export function isValidSeason(season: unknown): season is number {
    return typeof season === 'number' && Number.isInteger(season) && season >= 1 && season <= MAX_SEASON;
}
