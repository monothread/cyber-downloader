import type { Translator } from '@shared/i18n';
import type { AppUpdateState } from '@shared/types';

export function updateSummary(state: AppUpdateState, t: Translator): string {
    const version = state.version ?? '';
    switch (state.status) {
        case 'checking':
            return t('update.checking');
        case 'available':
            return t('update.available', { version });
        case 'downloading':
            return t('update.downloading', { version, percent: state.percent.toFixed(1) });
        case 'downloaded':
            return t('update.downloaded', { version });
        case 'not-available':
            return t('update.latest', { version: state.currentVersion });
        case 'unsupported':
            return t('update.unsupported');
        case 'error':
            return state.message ?? t('update.failed');
        default:
            return t('update.current', { version: state.currentVersion });
    }
}
