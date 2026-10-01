import { Menu, Tray, nativeImage } from 'electron';
import { createElectronTray } from '@main/services/electronTray';

const trayInstance = { setToolTip: vi.fn(), setContextMenu: vi.fn(), on: vi.fn(), destroy: vi.fn() };
const resizedImage = { resized: true };

vi.mock('electron', () => {
    return {
        Tray: vi.fn(function Tray() {
            return trayInstance;
        }),
        Menu: { buildFromTemplate: vi.fn(() => {return { built: true }}) },
        nativeImage: { createFromPath: vi.fn(() => {return { resize: vi.fn(() => {return resizedImage}) }}) }
    };
});

function actions() {
    return { show: vi.fn(), toggle: vi.fn(), restart: vi.fn(), quit: vi.fn() };
}

describe('createElectronTray', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('builds the tray from the resized icon with a tooltip', () => {
        createElectronTray('/app/icon.png', actions());
        expect(nativeImage.createFromPath).toHaveBeenCalledWith('/app/icon.png');
        expect(Tray).toHaveBeenCalledWith(resizedImage);
        expect(trayInstance.setToolTip).toHaveBeenCalledWith('Cyber Downloader');
    });

    it('creates the context menu with show, restart and quit entries wired to the actions', () => {
        const handlers = actions();
        createElectronTray('/app/icon.png', handlers);
        expect(Menu.buildFromTemplate).toHaveBeenCalledWith([
            { label: 'Show Cyber Downloader', click: handlers.show },
            { label: 'Restart Cyber Downloader', click: handlers.restart },
            { type: 'separator' },
            { label: 'Quit', click: handlers.quit }
        ]);
        expect(trayInstance.setContextMenu).toHaveBeenCalledWith({ built: true });
    });

    it('toggles the window when the icon is clicked', () => {
        const handlers = actions();
        createElectronTray('/app/icon.png', handlers);
        expect(trayInstance.on).toHaveBeenCalledWith('click', handlers.toggle);
    });

    it('destroys the tray through the handle', () => {
        const handle = createElectronTray('/app/icon.png', actions());
        handle.destroy();
        expect(trayInstance.destroy).toHaveBeenCalledTimes(1);
    });
});
