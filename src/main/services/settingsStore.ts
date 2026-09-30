import { DEFAULT_SETTINGS } from '@shared/constants';
import type { Settings } from '@shared/types';
import { JsonStore } from './jsonStore';
import { sanitizeSettings } from './settingsSanitizer';

export class SettingsStore {
    private readonly store: JsonStore<Partial<Settings>>;

    constructor(filePath: string) {
        this.store = new JsonStore<Partial<Settings>>(filePath, {});
    }

    get(): Settings {
        return sanitizeSettings({ ...DEFAULT_SETTINGS, ...this.store.read() });
    }

    save(input: unknown): Settings {
        const sanitized = sanitizeSettings(input);
        this.store.write(sanitized);
        return sanitized;
    }
}
