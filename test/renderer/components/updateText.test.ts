import type { AppUpdateState } from '@shared/types';
import { updateSummary } from '@renderer/components/updateText';

const BASE: AppUpdateState = { status: 'idle', currentVersion: '0.1.0', version: null, percent: 0, message: null };

describe('updateSummary', () => {
    it('shows the current version when idle', () => {
        expect(updateSummary(BASE)).toBe('Current version: 0.1.0');
    });

    it('describes each state', () => {
        expect(updateSummary({ ...BASE, status: 'checking' })).toBe('Checking for updates…');
        expect(updateSummary({ ...BASE, status: 'available', version: '0.2.0' })).toBe('Version 0.2.0 is available.');
        expect(updateSummary({ ...BASE, status: 'downloading', version: '0.2.0', percent: 12.34 })).toBe('Downloading version 0.2.0… 12.3%');
        expect(updateSummary({ ...BASE, status: 'downloaded', version: '0.2.0' })).toBe('Version 0.2.0 is ready to install.');
    });

    it('shows the message for not-available, error and unsupported', () => {
        expect(updateSummary({ ...BASE, status: 'not-available', message: 'Latest.' })).toBe('Latest.');
        expect(updateSummary({ ...BASE, status: 'error', message: 'Broke.' })).toBe('Broke.');
        expect(updateSummary({ ...BASE, status: 'unsupported', message: 'Nope.' })).toBe('Nope.');
    });

    it('falls back to an empty text when a message is missing', () => {
        expect(updateSummary({ ...BASE, status: 'error' })).toBe('');
    });

    it('does not print a missing version', () => {
        expect(updateSummary({ ...BASE, status: 'available' })).toBe('Version  is available.');
    });
});
