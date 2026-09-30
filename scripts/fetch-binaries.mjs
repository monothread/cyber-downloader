#!/usr/bin/env node
// Downloads the third-party binaries bundled with the app (yt-dlp, ffmpeg/ffprobe, deno) into resources/bin.
// Every download is verified against the checksum published by its source.
//
//   node scripts/fetch-binaries.mjs [--platform=linux|win32] [--out=<dir>] [--force]
//
// The platform defaults to the one this script runs on.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
    chmodSync,
    copyFileSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    renameSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function option(name) {
    return args.find((arg) => {
        return arg.startsWith(`--${name}=`);
    })?.split('=')[1];
}

const FORCE = args.includes('--force');
const PLATFORM = option('platform') ?? process.platform;
const BIN_DIR = option('out') ? resolve(option('out')) : join(ROOT, 'resources', 'bin');

const YTDLP_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const DENO_BASE = 'https://github.com/denoland/deno/releases/latest/download';

const TARGETS = {
    linux: {
        ytdlpAsset: 'yt-dlp_linux',
        ytdlpFile: 'yt-dlp',
        denoArchive: 'deno-x86_64-unknown-linux-gnu.zip',
        denoFile: 'deno',
        ffmpegUrl: 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz',
        ffmpegHash: { algorithm: 'md5', suffix: '.md5', length: 32 },
        ffmpegFiles: ['ffmpeg', 'ffprobe']
    },
    win32: {
        ytdlpAsset: 'yt-dlp.exe',
        ytdlpFile: 'yt-dlp.exe',
        denoArchive: 'deno-x86_64-pc-windows-msvc.zip',
        denoFile: 'deno.exe',
        ffmpegUrl: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
        ffmpegHash: { algorithm: 'sha256', suffix: '.sha256', length: 64 },
        ffmpegFiles: ['ffmpeg.exe', 'ffprobe.exe']
    }
};

const TARGET = TARGETS[PLATFORM];
if (!TARGET) {
    console.error(`Unsupported platform "${PLATFORM}". Use linux or win32.`);
    process.exit(1);
}

async function download(url) {
    const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'cyber-downloader-build' } });
    if (!response.ok) {
        throw new Error(`Download failed (${response.status}): ${url}`);
    }
    return Buffer.from(await response.arrayBuffer());
}

function digest(algorithm, data) {
    return createHash(algorithm).update(data).digest('hex');
}

function verify(algorithm, data, expected, label) {
    const actual = digest(algorithm, data);
    if (actual !== expected.toLowerCase()) {
        throw new Error(`${label}: ${algorithm} mismatch (expected ${expected}, got ${actual})`);
    }
}

// Checksum files come in several shapes ("<hash>  <name>", a bare hash, PowerShell's Get-FileHash table).
function extractHash(text, length) {
    const match = new RegExp(`\\b[0-9a-fA-F]{${length}}\\b`).exec(text);
    if (!match) {
        throw new Error(`No ${length}-character checksum found in: ${text.slice(0, 80)}`);
    }
    return match[0];
}

function isPresent(...names) {
    return !FORCE && names.every((name) => {
        return existsSync(join(BIN_DIR, name));
    });
}

function extractZip(archivePath, destination) {
    mkdirSync(destination, { recursive: true });
    if (process.platform === 'win32') {
        // The "tar" first in PATH may be Git for Windows' GNU tar, which cannot read zip files; Windows' own bsdtar can.
        const systemTar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
        execFileSync(existsSync(systemTar) ? systemTar : 'tar', ['-xf', archivePath, '-C', destination]);
        return;
    }
    execFileSync('unzip', ['-o', '-q', archivePath, '-d', destination]);
}

function findFile(directory, fileName) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const fullPath = join(directory, entry.name);
        if (entry.isFile() && entry.name === fileName) {
            return fullPath;
        }
        if (entry.isDirectory()) {
            const found = findFile(fullPath, fileName);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

function installFile(source, name) {
    const target = join(BIN_DIR, name);
    copyFileSync(source, target);
    chmodSync(target, 0o755);
}

async function fetchYtdlp() {
    if (isPresent(TARGET.ytdlpFile)) {
        return;
    }
    console.log(`> yt-dlp (${TARGET.ytdlpAsset})`);
    const sums = (await download(`${YTDLP_BASE}/SHA2-256SUMS`)).toString('utf-8');
    const expected = sums.split('\n').map((line) => {
        return line.trim().split(/\s+/);
    }).find(([, name]) => {
        return name === TARGET.ytdlpAsset;
    });
    if (!expected) {
        throw new Error(`${TARGET.ytdlpAsset} not found in SHA2-256SUMS`);
    }
    const binary = await download(`${YTDLP_BASE}/${TARGET.ytdlpAsset}`);
    verify('sha256', binary, expected[0], 'yt-dlp');
    const target = join(BIN_DIR, TARGET.ytdlpFile);
    writeFileSync(`${target}.tmp`, binary);
    chmodSync(`${target}.tmp`, 0o755);
    renameSync(`${target}.tmp`, target);
}

async function fetchDeno(workDir) {
    if (isPresent(TARGET.denoFile)) {
        return;
    }
    console.log('> deno');
    const expected = extractHash((await download(`${DENO_BASE}/${TARGET.denoArchive}.sha256sum`)).toString('utf-8'), 64);
    const archive = await download(`${DENO_BASE}/${TARGET.denoArchive}`);
    verify('sha256', archive, expected, 'deno');
    const archivePath = join(workDir, 'deno.zip');
    writeFileSync(archivePath, archive);
    const extracted = join(workDir, 'deno');
    extractZip(archivePath, extracted);
    const binary = findFile(extracted, TARGET.denoFile);
    if (!binary) {
        throw new Error(`${TARGET.denoFile} not found in the deno archive`);
    }
    installFile(binary, TARGET.denoFile);
}

async function fetchFfmpeg(workDir) {
    if (isPresent(...TARGET.ffmpegFiles)) {
        return;
    }
    console.log('> ffmpeg + ffprobe');
    const { algorithm, suffix, length } = TARGET.ffmpegHash;
    const expected = extractHash((await download(`${TARGET.ffmpegUrl}${suffix}`)).toString('utf-8'), length);
    const archive = await download(TARGET.ffmpegUrl);
    verify(algorithm, archive, expected, 'ffmpeg');
    const isZip = TARGET.ffmpegUrl.endsWith('.zip');
    const archivePath = join(workDir, isZip ? 'ffmpeg.zip' : 'ffmpeg.tar.xz');
    writeFileSync(archivePath, archive);
    const extracted = join(workDir, 'ffmpeg');
    if (isZip) {
        extractZip(archivePath, extracted);
    } else {
        mkdirSync(extracted, { recursive: true });
        execFileSync('tar', ['-xJf', archivePath, '-C', extracted]);
    }
    for (const name of TARGET.ffmpegFiles) {
        const binary = findFile(extracted, name);
        if (!binary) {
            throw new Error(`${name} not found in the ffmpeg archive`);
        }
        installFile(binary, name);
    }
    const license = findFile(extracted, 'GPLv3.txt') ?? findFile(extracted, 'LICENSE');
    if (license) {
        copyFileSync(license, join(BIN_DIR, 'ffmpeg-GPLv3.txt'));
    }
}

async function main() {
    mkdirSync(BIN_DIR, { recursive: true });
    const workDir = mkdtempSync(join(tmpdir(), 'cyber-dl-bin-'));
    try {
        await fetchYtdlp();
        await fetchDeno(workDir);
        await fetchFfmpeg(workDir);
        console.log(`Binaries for ${PLATFORM} ready in ${BIN_DIR}`);
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
