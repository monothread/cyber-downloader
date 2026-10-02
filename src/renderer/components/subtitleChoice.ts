import type { AnimeSubtitleImportResponse, AnimeSubtitleTrack } from '@shared/anime';
import type { MessageKey } from '@shared/i18n';
import type { SubtitleOption } from './VideoControls';

const STORAGE_PREFIX = 'pullwave-subtitle-';
const OFF = 'off';
// The id the player gives the subtitles ani-cli picked (their own id is empty, which a <track> cannot have).
export const DEFAULT_OPTION_ID = 'default';

export type SubtitleImportFailure = Exclude<Extract<AnimeSubtitleImportResponse, { ok: false }>['reason'], 'cancelled'>;

const IMPORT_FAILURE_KEYS: Record<SubtitleImportFailure, MessageKey> = {
    unsupported: 'anime.player.subtitleError.unsupported',
    'too-large': 'anime.player.subtitleError.too-large',
    unreadable: 'anime.player.subtitleError.unreadable',
    missing: 'anime.player.subtitleError.missing'
};

export function importFailureKey(reason: SubtitleImportFailure): MessageKey {
    return IMPORT_FAILURE_KEYS[reason];
}

export function optionIdOf(track: AnimeSubtitleTrack): string {
    return track.id.length > 0 ? track.id : DEFAULT_OPTION_ID;
}

export function optionsOf(tracks: readonly AnimeSubtitleTrack[]): SubtitleOption[] {
    return tracks.map((track) => {
        return { id: optionIdOf(track), label: track.label };
    });
}

// What the viewer chose the last time they watched the episode: an id, null for "off", undefined when they never chose.
export function readSubtitleChoice(episodeId: number): string | null | undefined {
    try {
        const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${episodeId}`);
        if (stored === null) {
            return undefined;
        }
        return stored === OFF ? null : stored;
    } catch {
        return undefined;
    }
}

export function saveSubtitleChoice(episodeId: number, choice: string | null): void {
    try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${episodeId}`, choice ?? OFF);
    } catch {
        return;
    }
}

// The subtitle to show: the one chosen before when it is still there, otherwise the first (the one ani-cli picked).
export function initialSubtitle(options: readonly SubtitleOption[], stored: string | null | undefined): string | null {
    if (stored === null) {
        return null;
    }
    const found = options.find((option) => {
        return option.id === stored;
    });
    return found ? found.id : (options[0]?.id ?? null);
}
