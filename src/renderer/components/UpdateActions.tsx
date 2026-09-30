import { useAppStore } from '../store/appStore';

export function UpdateActions() {
    const status = useAppStore((state) => {
        return state.appUpdate.status;
    });
    const version = useAppStore((state) => {
        return state.appUpdate.version;
    });
    const downloadAppUpdate = useAppStore((state) => {
        return state.downloadAppUpdate;
    });
    const installAppUpdate = useAppStore((state) => {
        return state.installAppUpdate;
    });

    if (status === 'available') {
        return (
            <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => {
                    void downloadAppUpdate();
                }}
            >
                UPDATE TO {version}
            </button>
        );
    }
    if (status === 'downloaded') {
        return (
            <button
                type="button"
                className="btn btn--small btn--primary"
                onClick={() => {
                    void installAppUpdate();
                }}
            >
                RESTART & INSTALL
            </button>
        );
    }
    return null;
}
