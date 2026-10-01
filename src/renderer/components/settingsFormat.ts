import type { Translator } from '@shared/i18n';
import type { MaxResolution } from '@shared/types';

export function formatResolution(resolution: MaxResolution, t: Translator): string {
    return resolution === 'best' ? t('resolution.best') : t('resolution.upTo', { resolution });
}

export function formatSwitch(value: boolean, t: Translator): string {
    return value ? t('options.on') : t('options.off');
}
