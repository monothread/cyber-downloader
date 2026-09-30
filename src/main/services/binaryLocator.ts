import { execFile } from 'node:child_process';
import type { BinariesStatus, BinaryInfo, Settings } from '@shared/types';
import type { BinaryResolver, ResolvedBinary } from './binaryResolver';

export type ExecFileFn = (file: string, args: string[]) => Promise<string>;

const EXEC_TIMEOUT_MS = 15000;

export function defaultExecFile(file: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        execFile(file, args, { timeout: EXEC_TIMEOUT_MS }, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(stdout);
        });
    });
}

export function parseFfmpegVersion(output: string): string | null {
    const firstLine = output.split('\n')[0] ?? '';
    const match = /version\s+(\S+)/.exec(firstLine);
    return match?.[1] ?? null;
}

async function probeBinary(
    binary: ResolvedBinary,
    versionArgs: string[],
    parseVersion: (output: string) => string | null,
    exec: ExecFileFn
): Promise<BinaryInfo> {
    try {
        const output = await exec(binary.path, versionArgs);
        return { found: true, path: binary.path, version: parseVersion(output), source: binary.source };
    } catch {
        return { found: false, path: binary.path, version: null, source: binary.source };
    }
}

export async function checkBinaries(
    settings: Settings,
    resolver: BinaryResolver,
    exec: ExecFileFn = defaultExecFile
): Promise<BinariesStatus> {
    const [ytdlp, ffmpeg] = await Promise.all([
        probeBinary(
            resolver.ytdlp(settings),
            ['--version'],
            (output) => {
                const version = output.trim();
                return version.length > 0 ? version : null;
            },
            exec
        ),
        probeBinary(resolver.ffmpeg(settings), ['-version'], parseFfmpegVersion, exec)
    ]);
    return { ytdlp, ffmpeg };
}
