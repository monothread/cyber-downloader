import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import type { Settings, UpdateResult } from '@shared/types';
import type { BinaryResolver } from './binaryResolver';

const UPDATE_TIMEOUT_MS = 120000;
const RELEASE_API_URL = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const RELEASE_DOWNLOAD_URL = 'https://github.com/yt-dlp/yt-dlp/releases/download';
const ASSET_NAME = 'yt-dlp_linux';
const CHECKSUMS_NAME = 'SHA2-256SUMS';
const USER_AGENT = 'cyber-downloader';

export type UpdateExecFn = (file: string, args: string[]) => Promise<{ ok: boolean; output: string }>;

export interface UpdaterDependencies {
    exec: UpdateExecFn;
    fetchText: (url: string) => Promise<string>;
    fetchBuffer: (url: string) => Promise<Buffer>;
}

export function defaultUpdateExec(file: string, args: string[]): Promise<{ ok: boolean; output: string }> {
    return new Promise((resolve) => {
        execFile(file, args, { timeout: UPDATE_TIMEOUT_MS }, (error, stdout, stderr) => {
            resolve({ ok: error === null, output: `${stdout}${stderr}`.trim() || (error?.message ?? '') });
        });
    });
}

async function fetchOk(url: string): Promise<Response> {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow' });
    if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`);
    }
    return response;
}

export const defaultUpdaterDependencies: UpdaterDependencies = {
    exec: defaultUpdateExec,
    fetchText: async (url) => {
        return (await fetchOk(url)).text();
    },
    fetchBuffer: async (url) => {
        return Buffer.from(await (await fetchOk(url)).arrayBuffer());
    }
};

export function parseChecksum(checksums: string, fileName: string): string | null {
    for (const line of checksums.split('\n')) {
        const [hash, name] = line.trim().split(/\s+/);
        if (name === fileName && hash) {
            return hash.toLowerCase();
        }
    }
    return null;
}

function sha256(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
}

async function readVersion(exec: UpdateExecFn, path: string): Promise<string | null> {
    const result = await exec(path, ['--version']);
    return result.ok && result.output.length > 0 ? result.output.trim() : null;
}

async function downloadLatest(resolver: BinaryResolver, settings: Settings, deps: UpdaterDependencies): Promise<UpdateResult> {
    const release = JSON.parse(await deps.fetchText(RELEASE_API_URL)) as { tag_name?: string };
    const tag = release.tag_name;
    if (!tag) {
        return { ok: false, output: 'Could not determine the latest yt-dlp version.' };
    }
    const currentVersion = await readVersion(deps.exec, resolver.ytdlp(settings).path);
    if (currentVersion === tag) {
        return { ok: true, output: `yt-dlp is already up to date (${tag}).` };
    }
    const checksums = await deps.fetchText(`${RELEASE_DOWNLOAD_URL}/${tag}/${CHECKSUMS_NAME}`);
    const expected = parseChecksum(checksums, ASSET_NAME);
    const binary = await deps.fetchBuffer(`${RELEASE_DOWNLOAD_URL}/${tag}/${ASSET_NAME}`);
    if (expected === null || sha256(binary) !== expected) {
        return { ok: false, output: 'Checksum verification failed. The download was discarded.' };
    }
    mkdirSync(resolver.userBinDir, { recursive: true });
    const temporaryPath = `${resolver.userYtdlpPath}.tmp`;
    writeFileSync(temporaryPath, binary);
    chmodSync(temporaryPath, 0o755);
    renameSync(temporaryPath, resolver.userYtdlpPath);
    return { ok: true, output: `Updated yt-dlp ${currentVersion ?? 'unknown'} → ${tag}.` };
}

export async function updateYtdlp(
    settings: Settings,
    resolver: BinaryResolver,
    deps: UpdaterDependencies = defaultUpdaterDependencies
): Promise<UpdateResult> {
    if (settings.ytdlpPath.length > 0) {
        return deps.exec(settings.ytdlpPath, ['-U']);
    }
    try {
        return await downloadLatest(resolver, settings, deps);
    } catch (error) {
        return { ok: false, output: error instanceof Error ? error.message : 'Update failed.' };
    }
}
