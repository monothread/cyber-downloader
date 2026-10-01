import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import type { Settings, UpdateResult } from '@shared/types';
import type { BinaryResolver } from './binaryResolver';
import { translateMain } from './language';

const UPDATE_TIMEOUT_MS = 120000;
const RELEASE_API_URL = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
const RELEASE_DOWNLOAD_URL = 'https://github.com/yt-dlp/yt-dlp/releases/download';
const ASSET_NAMES: Partial<Record<NodeJS.Platform, string>> = { linux: 'yt-dlp_linux', win32: 'yt-dlp.exe' };
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

async function downloadLatest(
    resolver: BinaryResolver,
    settings: Settings,
    deps: UpdaterDependencies,
    assetName: string
): Promise<UpdateResult> {
    const release = JSON.parse(await deps.fetchText(RELEASE_API_URL)) as { tag_name?: string };
    const tag = release.tag_name;
    if (!tag) {
        return { ok: false, output: translateMain('ytdlp.noRelease') };
    }
    const currentVersion = await readVersion(deps.exec, resolver.ytdlp(settings).path);
    if (currentVersion === tag) {
        return { ok: true, output: translateMain('ytdlp.upToDate', { tag }) };
    }
    const checksums = await deps.fetchText(`${RELEASE_DOWNLOAD_URL}/${tag}/${CHECKSUMS_NAME}`);
    const expected = parseChecksum(checksums, assetName);
    const binary = await deps.fetchBuffer(`${RELEASE_DOWNLOAD_URL}/${tag}/${assetName}`);
    if (expected === null || sha256(binary) !== expected) {
        return { ok: false, output: translateMain('ytdlp.checksumFailed') };
    }
    mkdirSync(resolver.userBinDir, { recursive: true });
    const temporaryPath = `${resolver.userYtdlpPath}.tmp`;
    writeFileSync(temporaryPath, binary);
    chmodSync(temporaryPath, 0o755);
    renameSync(temporaryPath, resolver.userYtdlpPath);
    return { ok: true, output: translateMain('ytdlp.updated', { from: currentVersion ?? translateMain('ytdlp.versionUnknown'), tag }) };
}

export async function updateYtdlp(
    settings: Settings,
    resolver: BinaryResolver,
    deps: UpdaterDependencies = defaultUpdaterDependencies,
    platform: NodeJS.Platform = process.platform
): Promise<UpdateResult> {
    if (settings.ytdlpPath.length > 0) {
        return deps.exec(settings.ytdlpPath, ['-U']);
    }
    const assetName = ASSET_NAMES[platform];
    if (!assetName) {
        return { ok: false, output: translateMain('ytdlp.unsupportedPlatform', { platform }) };
    }
    try {
        return await downloadLatest(resolver, settings, deps, assetName);
    } catch (error) {
        return { ok: false, output: error instanceof Error ? error.message : translateMain('update.failed') };
    }
}
