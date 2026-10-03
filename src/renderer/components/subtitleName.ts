import type { LanguageCode } from '@shared/types';

// The names of the subtitles of the source come as the source writes them, in English and with noise ("Portuguese (-
// Portuguese(Brazil))"). This shows them as the language of the app writes the language ("Português (Brasil)"). Only what is shown
// changes: the files and the ids of the subtitles keep their names.

const NAME_PATTERN = /^([A-Za-z]+(?: [A-Za-z]+)*)(?:\s*\((.*)\))?$/;
const LAST_PARENTHESES = /\(([^()]+)\)\s*$/;

interface CodesByEnglishName {
    languages: Map<string, string>;
    regions: Map<string, string>;
}

let codesCache: CodesByEnglishName | null = null;

// The code of each language and of each region by the name English gives it: the names come from the browser, which is asked about
// every two-letter code (and every three-digit code of a region, like 419, Latin America) and the answers are turned around.
function codesByEnglishName(): CodesByEnglishName {
    if (codesCache !== null) {
        return codesCache;
    }
    const languageNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
    const regionNames = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
    const letters = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const pairs = letters.flatMap((first) => {
        return letters.map((second) => {
            return `${first}${second}`;
        });
    });
    const languages = new Map<string, string>();
    pairs.forEach((code) => {
        const name = languageNames.of(code);
        if (name !== undefined && !languages.has(name.toLowerCase())) {
            languages.set(name.toLowerCase(), code);
        }
    });
    const regions = new Map<string, string>();
    const regionCodes = [
        ...pairs.map((code) => {
            return code.toUpperCase();
        }),
        ...Array.from({ length: 999 }, (_unused, number) => {
            return String(number + 1).padStart(3, '0');
        })
    ];
    regionCodes.forEach((code) => {
        let name: string | undefined;
        try {
            name = regionNames.of(code);
        } catch {
            name = undefined;
        }
        if (name !== undefined && !regions.has(name.toLowerCase())) {
            regions.set(name.toLowerCase(), code);
        }
    });
    codesCache = { languages, regions };
    return codesCache;
}

interface ParsedName {
    language: string;
    // What is written for the region, without the noise around it; empty when there is none.
    region: string;
}

// The language and the region of a name, or null when it is not written as a language with something between parentheses.
function parseName(label: string): ParsedName | null {
    const found = NAME_PATTERN.exec(label.trim());
    if (found === null) {
        return null;
    }
    const language = found[1] as string;
    const inner = (found[2] ?? '').trim();
    const nested = LAST_PARENTHESES.exec(inner);
    const region = (nested ? (nested[1] as string) : inner.replace(/^-\s*/, '')).trim();
    return { language, region: region.toLowerCase() === language.toLowerCase() ? '' : region };
}

function withCapital(text: string, language: LanguageCode): string {
    return text.length === 0 ? text : `${text.charAt(0).toLocaleUpperCase(language)}${text.slice(1)}`;
}

// The name without the noise, still in English ("Portuguese (Brazil)"); what could not be read stays as it is.
export function cleanSubtitleName(label: string): string {
    const parsed = parseName(label);
    if (parsed === null) {
        return label;
    }
    return parsed.region.length > 0 ? `${parsed.language} (${parsed.region})` : parsed.language;
}

// The name of a subtitle as the language of the app writes it. A language it does not know is shown clean, in English; a name it
// cannot read, as it came.
export function subtitleDisplayName(label: string, language: LanguageCode): string {
    const parsed = parseName(label);
    if (parsed === null) {
        return label;
    }
    try {
        const codes = codesByEnglishName();
        const languageCode = codes.languages.get(parsed.language.toLowerCase());
        if (languageCode === undefined) {
            return cleanSubtitleName(label);
        }
        const names = new Intl.DisplayNames([language], { type: 'language', languageDisplay: 'standard' });
        const regionCode = parsed.region.length > 0 ? codes.regions.get(parsed.region.toLowerCase()) : undefined;
        if (regionCode !== undefined) {
            return withCapital(names.of(`${languageCode}-${regionCode}`) ?? cleanSubtitleName(label), language);
        }
        const base = withCapital(names.of(languageCode) ?? parsed.language, language);
        return parsed.region.length > 0 ? `${base} (${parsed.region})` : base;
    } catch {
        return cleanSubtitleName(label);
    }
}

// The names of a list of subtitles. Two that would be written the same are told apart: the second one is shown clean, in English,
// and, if that is the same too, as it came.
export function subtitleDisplayNames(labels: readonly string[], language: LanguageCode): string[] {
    const taken = new Set<string>();
    return labels.map((label) => {
        const candidates = [subtitleDisplayName(label, language), cleanSubtitleName(label), label];
        const chosen =
            candidates.find((candidate) => {
                return !taken.has(candidate);
            }) ?? label;
        taken.add(chosen);
        return chosen;
    });
}
