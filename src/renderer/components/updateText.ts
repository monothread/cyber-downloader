import type { AppUpdateState } from '@shared/types';

export function updateSummary(state: AppUpdateState): string {
    switch (state.status) {
        case 'checking':
            return 'Checking for updates…';
        case 'available':
            return `Version ${state.version ?? ''} is available.`;
        case 'downloading':
            return `Downloading version ${state.version ?? ''}… ${state.percent.toFixed(1)}%`;
        case 'downloaded':
            return `Version ${state.version ?? ''} is ready to install.`;
        case 'not-available':
        case 'error':
        case 'unsupported':
            return state.message ?? '';
        default:
            return `Current version: ${state.currentVersion}`;
    }
}
