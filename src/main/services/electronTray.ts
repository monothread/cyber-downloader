import { Menu, Tray, nativeImage } from 'electron';
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
            { label: 'Show Cyber Downloader', click: actions.show },
            { label: 'Restart Cyber Downloader', click: actions.restart },
            { type: 'separator' },
            { label: 'Quit', click: actions.quit }
        ])
    );
    tray.on('click', actions.toggle);
    return {
        destroy: (): void => {
            tray.destroy();
        }
    };
}
