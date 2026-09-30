import { spawn } from 'node:child_process';

export interface KillableProcess {
    pid?: number;
    kill: (signal?: NodeJS.Signals) => boolean;
}

export type TaskkillSpawn = (command: string, args: string[]) => void;

function defaultTaskkill(command: string, args: string[]): void {
    const child = spawn(command, args, { stdio: 'ignore', windowsHide: true });
    child.on('error', () => {
        return undefined;
    });
}

// Ends a process and everything it started. On Windows killing yt-dlp alone leaves the ffmpeg it launched running
// (and writing) in the background, so the whole tree is ended with taskkill; elsewhere SIGTERM lets yt-dlp clean up.
export function killProcessTree(
    child: KillableProcess,
    platform: NodeJS.Platform = process.platform,
    taskkill: TaskkillSpawn = defaultTaskkill
): void {
    if (platform !== 'win32' || child.pid === undefined) {
        child.kill('SIGTERM');
        return;
    }
    taskkill('taskkill', ['/PID', String(child.pid), '/T', '/F']);
}
