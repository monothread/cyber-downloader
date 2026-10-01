import { spawn } from 'node:child_process';

export interface KillableProcess {
    pid?: number;
    kill: (signal?: NodeJS.Signals) => boolean;
}

export type TaskkillSpawn = (command: string, args: string[]) => void;
// Sends a signal to a whole process group (the process and everything it started).
export type GroupKill = (pid: number, signal: NodeJS.Signals) => void;

function defaultTaskkill(command: string, args: string[]): void {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', () => {
        return undefined;
    });
}

function defaultGroupKill(pid: number, signal: NodeJS.Signals): void {
    process.kill(-pid, signal);
}

// Ends a process and everything it started. On Windows killing yt-dlp alone leaves the ffmpeg it launched running
// (and writing) in the background, so the whole tree is ended with taskkill. Elsewhere yt-dlp runs in a group of its
// own (see `defaultSpawn`), so the signal goes to the group: ffmpeg is reached too instead of being left running with
// the pipes open. A process that is not a group leader is signalled alone.
export function killProcessTree(
    child: KillableProcess,
    platform: NodeJS.Platform = process.platform,
    taskkill: TaskkillSpawn = defaultTaskkill,
    signal: NodeJS.Signals = 'SIGTERM',
    killGroup: GroupKill = defaultGroupKill
): void {
    if (child.pid !== undefined && platform === 'win32') {
        taskkill('taskkill', ['/PID', String(child.pid), '/T', '/F']);
        return;
    }
    if (child.pid !== undefined) {
        try {
            killGroup(child.pid, signal);
            return;
        } catch {
            // Not a group leader, or already gone: fall back to the process itself.
        }
    }
    child.kill(signal);
}
