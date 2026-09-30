import type { CyberApi } from '@shared/types';

declare global {
    interface Window {
        api: CyberApi;
    }
}

export {};
