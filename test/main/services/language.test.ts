import { applyLanguage, translateMain } from '@main/services/language';

afterEach(() => {
    applyLanguage('en', 'en-US');
});

describe('translateMain', () => {
    it('speaks English by default', () => {
        expect(translateMain('tray.quit')).toBe('Quit');
    });

    it('uses the explicit language', () => {
        applyLanguage('pt', 'en-US');
        expect(translateMain('tray.quit')).toBe('Sair');
        applyLanguage('ja', 'en-US');
        expect(translateMain('tray.quit')).toBe('終了');
    });

    it('follows the system locale for "device"', () => {
        applyLanguage('device', 'es-MX');
        expect(translateMain('tray.quit')).toBe('Salir');
    });

    it('falls back to English when the system locale is not supported', () => {
        applyLanguage('device', 'fr-FR');
        expect(translateMain('tray.quit')).toBe('Quit');
    });

    it('interpolates the params', () => {
        applyLanguage('zh', 'en-US');
        expect(translateMain('dialog.pendingMany', { count: 3 })).toBe('还有 3 个下载正在进行。');
    });
});
