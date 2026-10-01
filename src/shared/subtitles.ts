import type { Settings } from './types';

export function hasUnboundedAutoSubtitles(settings: Pick<Settings, 'writeSubtitles' | 'autoSubtitles' | 'subtitleLangs'>): boolean {
    if (!settings.writeSubtitles || !settings.autoSubtitles) {
        return false;
    }
    const languages = settings.subtitleLangs.trim().toLowerCase();
    return languages.length === 0 || languages === 'all';
}
