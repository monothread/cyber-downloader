import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { DownloadError, DownloadInfo, ProgressInfo } from '@shared/types';
import { mapDownloadError, mapSpawnError } from './errorMapper';
import { parseFileLine, parseInfoLine, parseProgressLine } from './progressParser';

export type SpawnFn = (command: string, args: string[], env?: NodeJS.ProcessEnv) => ChildProcessWithoutNullStreams;

export type RunResult =
    | { status: 'done'; filePath: string | null }
    | { status: 'error'; error: DownloadError }
    | { status: 'cancelled' };

export interface RunHandle {
    result: Promise<RunResult>;
    cancel: () => void;
    // Asks yt-dlp to finish and keep what it has (Ctrl+C): how a live recording is ended without losing it.
    stop: () => void;
}

export interface RunOptions {
    binary: string;
    args: string[];
    onProgress: (progress: ProgressInfo) => void;
    onInfo?: (info: DownloadInfo) => void;
    env?: NodeJS.ProcessEnv;
    spawnFn?: SpawnFn;
}

export function defaultSpawn(command: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
    return spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'], env });
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
    let cancelled = false;
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
            child.kill('SIGTERM');
        },
        stop: (): void => {
            child.kill('SIGINT');
        }
    };
}
