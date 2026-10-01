import { Menu, Tray, nativeImage } from 'electron';
import { translateMain } from './language';
import type { TrayHandle } from './trayManager';

export interface TrayActions {
    show: () => void;
    toggle: () => void;
    restart: () => void;
    quit: () => void;
}

const TRAY_ICON_SIZE = 22;

export function createElectronTray(iconPath: string, actions: TrayActions): TrayHandle {
    const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: TRAY_ICON_SIZE, height: TRAY_ICON_SIZE }));
    tray.setToolTip('Cyber Downloader');
    tray.setContextMenu(
        Menu.buildFromTemplate([
            { label: translateMain('tray.show'), click: actions.show },
            { label: translateMain('tray.restart'), click: actions.restart },
            { type: 'separator' },
            { label: translateMain('tray.quit'), click: actions.quit }
        ])
    );
    tray.on('click', actions.toggle);
    return {
        destroy: (): void => {
            tray.destroy();
        }
    };
}
