import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { DownloadError, DownloadInfo, ProgressInfo } from '@shared/types';
import { mapDownloadError, mapSpawnError } from './errorMapper';
import { killProcessTree, type TaskkillSpawn } from './processTree';
import { parseFileLine, parseInfoLine, parseProgressLine } from './progressParser';

export type SpawnFn = (command: string, args: string[], env?: NodeJS.ProcessEnv) => ChildProcessWithoutNullStreams;

export type RunResult =
    | { status: 'done'; filePath: string | null }
    | { status: 'error'; error: DownloadError }
    | { status: 'cancelled' }
    // Ended on purpose by killing the process (Windows has no way to ask yt-dlp to finish): the caller salvages the file.
    | { status: 'stopped' };

export interface RunHandle {
    result: Promise<RunResult>;
    cancel: () => void;
    // Ends a live recording keeping what it has: Ctrl+C (SIGINT) where that exists; on Windows the process tree is
    // killed and the result is `stopped`, so the partial file can be salvaged.
    stop: () => void;
}

export interface RunOptions {
    binary: string;
    args: string[];
    onProgress: (progress: ProgressInfo) => void;
    onInfo?: (info: DownloadInfo) => void;
    env?: NodeJS.ProcessEnv;
    spawnFn?: SpawnFn;
    platform?: NodeJS.Platform;
    taskkill?: TaskkillSpawn;
}

export function defaultSpawn(command: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
    return spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env, windowsHide: true });
}

export function createLineSplitter(onLine: (line: string) => void): { push: (chunk: string) => void; flush: () => void } {
    let buffer = '';
    return {
        push: (chunk: string): void => {
            buffer += chunk;
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? '';
            lines.forEach(onLine);
        },
        flush: (): void => {
            if (buffer.length > 0) {
                onLine(buffer);
            }
            buffer = '';
        }
    };
}

export function runYtdlp(options: RunOptions): RunHandle {
    const spawnFn = options.spawnFn ?? defaultSpawn;
    const child = spawnFn(options.binary, options.args, options.env);
    const platform = options.platform ?? process.platform;
    let cancelled = false;
    let stopped = false;
    let filePath: string | null = null;
    let stderr = '';

    const stdoutSplitter = createLineSplitter((line) => {
        const progress = parseProgressLine(line);
        if (progress) {
            options.onProgress(progress);
            return;
        }
        const info = parseInfoLine(line);
        if (info) {
            options.onInfo?.(info);
            return;
        }
        filePath = parseFileLine(line) ?? filePath;
    });

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', stdoutSplitter.push);
    child.stderr.on('data', (chunk: string) => {
        stderr += chunk;
    });

    const result = new Promise<RunResult>((resolve) => {
        child.once('error', (error: NodeJS.ErrnoException) => {
            resolve({ status: 'error', error: mapSpawnError(error) });
        });
        child.once('close', (code: number | null) => {
            stdoutSplitter.flush();
            if (cancelled) {
                resolve({ status: 'cancelled' });
                return;
            }
            if (stopped) {
                resolve({ status: 'stopped' });
                return;
            }
            if (code === 0) {
                resolve({ status: 'done', filePath });
                return;
            }
            resolve({ status: 'error', error: mapDownloadError(stderr, code) });
        });
    });

    return {
        result,
        cancel: (): void => {
            cancelled = true;
            killProcessTree(child, platform, options.taskkill);
        },
        stop: (): void => {
            if (platform === 'win32') {
                stopped = true;
                killProcessTree(child, platform, options.taskkill);
                return;
            }
            child.kill('SIGINT');
        }
    };
}
