import type { AppUpdateState } from '@shared/types';

export interface UpdateInfoLike {
    version: string;
}

export interface ProgressInfoLike {
    percent: number;
}

export interface UpdaterEvents {
    'checking-for-update': () => void;
    'update-available': (info: UpdateInfoLike) => void;
    'update-not-available': (info: UpdateInfoLike) => void;
    'download-progress': (progress: ProgressInfoLike) => void;
    'update-downloaded': (info: UpdateInfoLike) => void;
    error: (error: Error) => void;
}

export interface UpdaterLike {
    on: <K extends keyof UpdaterEvents>(event: K, listener: UpdaterEvents[K]) => unknown;
    checkForUpdates: () => Promise<unknown>;
    downloadUpdate: () => Promise<unknown>;
    quitAndInstall: (isSilent?: boolean, isForceRunAfter?: boolean) => void;
}

export interface AppUpdateOptions {
    supported: boolean;
    currentVersion: string;
}

export const UNSUPPORTED_MESSAGE = 'Updates are only available in the installed app.';

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Update failed.';
}

export class AppUpdateService {
    private state: AppUpdateState;

    constructor(
        private readonly updater: UpdaterLike,
        private readonly options: AppUpdateOptions,
        private readonly onChange: (state: AppUpdateState) => void
    ) {
        this.state = { status: 'idle', currentVersion: options.currentVersion, version: null, percent: 0, message: null };
        this.listen();
    }

    getState(): AppUpdateState {
        return { ...this.state };
    }

    async check(): Promise<void> {
        if (!this.options.supported) {
            this.setState({ status: 'unsupported', message: UNSUPPORTED_MESSAGE });
            return;
        }
        if (this.blocksCheck()) {
            return;
        }
        this.setState({ status: 'checking', message: null });
        try {
            await this.updater.checkForUpdates();
        } catch (error) {
            this.setState({ status: 'error', message: errorMessage(error) });
        }
    }

    async download(): Promise<void> {
        if (this.state.status !== 'available') {
            return;
        }
        this.setState({ status: 'downloading', percent: 0, message: null });
        try {
            await this.updater.downloadUpdate();
        } catch (error) {
            this.setState({ status: 'error', message: errorMessage(error) });
        }
    }

    install(): void {
        if (this.state.status !== 'downloaded') {
            return;
        }
        this.updater.quitAndInstall(false, true);
    }

    private blocksCheck(): boolean {
        return this.state.status === 'checking' || this.state.status === 'downloading' || this.state.status === 'downloaded';
    }

    private setState(patch: Partial<AppUpdateState>): void {
        this.state = { ...this.state, ...patch };
        this.onChange(this.getState());
    }

    private listen(): void {
        this.updater.on('update-available', (info) => {
            this.setState({ status: 'available', version: info.version, percent: 0, message: null });
        });
        this.updater.on('update-not-available', () => {
            this.setState({
                status: 'not-available',
                version: null,
                message: `You are on the latest version (${this.options.currentVersion}).`
            });
        });
        this.updater.on('download-progress', (progress) => {
            this.setState({ status: 'downloading', percent: Math.round(progress.percent * 10) / 10 });
        });
        this.updater.on('update-downloaded', (info) => {
            this.setState({ status: 'downloaded', version: info.version, percent: 100, message: null });
        });
        this.updater.on('error', (error) => {
            this.setState({ status: 'error', message: errorMessage(error) });
        });
    }
}
