const COLOR_STORAGE_KEY = 'pullwave-subtitle-color';
const BACKGROUND_STORAGE_KEY = 'pullwave-subtitle-background';

// A choice of the viewer. A null value means "what the theme says", so no variable is set on the video.
export interface SubtitleColorChoice<Id extends string> {
    id: Id;
    value: string | null;
    // Key of the name in the translations.
    labelKey: SubtitleColorLabelKey;
}

export type SubtitleColorLabelKey =
    | 'anime.player.subtitleColorTheme'
    | 'anime.player.subtitleColorWhite'
    | 'anime.player.subtitleColorYellow'
    | 'anime.player.subtitleColorCyan'
    | 'anime.player.subtitleColorGreen'
    | 'anime.player.subtitleBackgroundDim'
    | 'anime.player.subtitleBackgroundSolid'
    | 'anime.player.subtitleBackgroundNone';

export type SubtitleTextColorId = 'theme' | 'white' | 'yellow' | 'cyan' | 'green';
export type SubtitleBackgroundId = 'dim' | 'solid' | 'none';

export const SUBTITLE_COLOR_VARIABLE = '--subtitle-color';
export const SUBTITLE_BACKGROUND_VARIABLE = '--subtitle-background';

export const DEFAULT_SUBTITLE_COLOR: SubtitleTextColorId = 'theme';
export const DEFAULT_SUBTITLE_BACKGROUND: SubtitleBackgroundId = 'dim';

export const SUBTITLE_COLORS: readonly SubtitleColorChoice<SubtitleTextColorId>[] = [
    { id: 'theme', value: null, labelKey: 'anime.player.subtitleColorTheme' },
    { id: 'white', value: '#ffffff', labelKey: 'anime.player.subtitleColorWhite' },
    { id: 'yellow', value: '#ffeb3b', labelKey: 'anime.player.subtitleColorYellow' },
    { id: 'cyan', value: '#4dd0e1', labelKey: 'anime.player.subtitleColorCyan' },
    { id: 'green', value: '#69f0ae', labelKey: 'anime.player.subtitleColorGreen' }
];

export const SUBTITLE_BACKGROUNDS: readonly SubtitleColorChoice<SubtitleBackgroundId>[] = [
    { id: 'dim', value: null, labelKey: 'anime.player.subtitleBackgroundDim' },
    { id: 'solid', value: '#000000', labelKey: 'anime.player.subtitleBackgroundSolid' },
    { id: 'none', value: 'transparent', labelKey: 'anime.player.subtitleBackgroundNone' }
];

function readChoice<Id extends string>(key: string, choices: readonly SubtitleColorChoice<Id>[], fallback: Id): Id {
    try {
        const stored = window.localStorage.getItem(key);
        const found = choices.find((choice) => {
            return choice.id === stored;
        });
        return found ? found.id : fallback;
    } catch {
        return fallback;
    }
}

function saveChoice(key: string, id: string): void {
    try {
        window.localStorage.setItem(key, id);
    } catch {
        return;
    }
}

// What the viewer chose the last time: it is the same for every episode.
export function readSubtitleColor(): SubtitleTextColorId {
    return readChoice(COLOR_STORAGE_KEY, SUBTITLE_COLORS, DEFAULT_SUBTITLE_COLOR);
}

export function saveSubtitleColor(id: SubtitleTextColorId): void {
    saveChoice(COLOR_STORAGE_KEY, id);
}

export function readSubtitleBackground(): SubtitleBackgroundId {
    return readChoice(BACKGROUND_STORAGE_KEY, SUBTITLE_BACKGROUNDS, DEFAULT_SUBTITLE_BACKGROUND);
}

export function saveSubtitleBackground(id: SubtitleBackgroundId): void {
    saveChoice(BACKGROUND_STORAGE_KEY, id);
}

export function isSubtitleColorId(id: string): id is SubtitleTextColorId {
    return SUBTITLE_COLORS.some((choice) => {
        return choice.id === id;
    });
}

export function isSubtitleBackgroundId(id: string): id is SubtitleBackgroundId {
    return SUBTITLE_BACKGROUNDS.some((choice) => {
        return choice.id === id;
    });
}

// Sets the variable the style of the subtitles reads (see .player__video::cue), or clears it to leave the theme in charge.
export function applySubtitleChoice<Id extends string>(element: HTMLElement, variable: string, choices: readonly SubtitleColorChoice<Id>[], id: Id): void {
    const value = choices.find((choice) => {
        return choice.id === id;
    })?.value;
    if (value) {
        element.style.setProperty(variable, value);
    } else {
        element.style.removeProperty(variable);
    }
}
