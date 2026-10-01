import type { Settings } from './types';

export const UNBOUNDED_AUTO_SUBTITLES_MESSAGE =
    'Auto-generated subtitles need a language. Fill in "Subtitle languages" in Settings (e.g. ja), or turn off "Include auto-generated subtitles".';

export function hasUnboundedAutoSubtitles(settings: Pick<Settings, 'writeSubtitles' | 'autoSubtitles' | 'subtitleLangs'>): boolean {
    if (!settings.writeSubtitles || !settings.autoSubtitles) {
        return false;
    }
    const languages = settings.subtitleLangs.trim().toLowerCase();
    return languages.length === 0 || languages === 'all';
}
