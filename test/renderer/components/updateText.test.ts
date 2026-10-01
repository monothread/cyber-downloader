import { createTranslator } from '@shared/i18n';
import type { AppUpdateState } from '@shared/types';
import { updateSummary } from '@renderer/components/updateText';

const t = createTranslator('en');
const BASE: AppUpdateState = { status: 'idle', currentVersion: '0.1.0', version: null, percent: 0, message: null };

describe('updateSummary', () => {
    it('shows the current version when idle', () => {
        expect(updateSummary(BASE, t)).toBe('Current version: 0.1.0');
    });

    it('describes each state', () => {
        expect(updateSummary({ ...BASE, status: 'checking' }, t)).toBe('Checking for updates…');
        expect(updateSummary({ ...BASE, status: 'available', version: '0.2.0' }, t)).toBe('Version 0.2.0 is available.');
        expect(updateSummary({ ...BASE, status: 'downloading', version: '0.2.0', percent: 12.34 }, t)).toBe('Downloading version 0.2.0… 12.3%');
        expect(updateSummary({ ...BASE, status: 'downloaded', version: '0.2.0' }, t)).toBe('Version 0.2.0 is ready to install.');
    });

    it('translates the not-available and unsupported states and keeps the error message', () => {
        expect(updateSummary({ ...BASE, status: 'not-available', message: 'Latest.' }, t)).toBe('You are on the latest version (0.1.0).');
        expect(updateSummary({ ...BASE, status: 'unsupported', message: 'Nope.' }, t)).toBe('Updates are only available in the installed app.');
        expect(updateSummary({ ...BASE, status: 'error', message: 'Broke.' }, t)).toBe('Broke.');
    });

    it('falls back to a generic failure text when the error message is missing', () => {
        expect(updateSummary({ ...BASE, status: 'error' }, t)).toBe('Update failed.');
    });

    it('describes the states in another language', () => {
        const portuguese = createTranslator('pt');
        expect(updateSummary({ ...BASE, status: 'available', version: '0.2.0' }, portuguese)).toBe('A versão 0.2.0 está disponível.');
        expect(updateSummary({ ...BASE, status: 'downloading', version: '0.2.0', percent: 12.34 }, portuguese)).toBe('Baixando a versão 0.2.0… 12.3%');
    });

    it('does not print a missing version', () => {
        expect(updateSummary({ ...BASE, status: 'available' }, t)).toBe('Version  is available.');
    });
});
