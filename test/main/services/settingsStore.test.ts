import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS } from '@shared/constants';
import { SettingsStore } from '@main/services/settingsStore';
import { cleanTempDirs, makeTempDir } from '../../helpers/tempDir';

afterEach(() => {
    cleanTempDirs();
});

describe('SettingsStore', () => {
    it('returns the defaults when nothing is stored', () => {
        expect(new SettingsStore(join(makeTempDir(), 's.json')).get()).toEqual(DEFAULT_SETTINGS);
    });

    it('persists sanitized settings and returns them', () => {
        const path = join(makeTempDir(), 's.json');
        const store = new SettingsStore(path);
        const saved = store.save({ ...DEFAULT_SETTINGS, downloadDir: ' /media ', maxTitleLength: 5000 });
        expect(saved).toEqual({ ...DEFAULT_SETTINGS, downloadDir: '/media', maxTitleLength: 200 });
        expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual(saved);
        expect(new SettingsStore(path).get()).toEqual(saved);
    });

    it('fills in missing keys of an older stored file with defaults', () => {
        const path = join(makeTempDir(), 's.json');
        writeFileSync(path, JSON.stringify({ downloadDir: '/old' }));
        expect(new SettingsStore(path).get()).toEqual({ ...DEFAULT_SETTINGS, downloadDir: '/old' });
    });
});
