#!/usr/bin/env node
// Downloads the third-party binaries bundled with the app (yt-dlp, ffmpeg/ffprobe, deno)
// into resources/bin. Every download is verified against the checksum published by its source.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BIN_DIR = join(ROOT, 'resources', 'bin');
const FORCE = process.argv.includes('--force');

const YTDLP_BASE = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download';
const DENO_URL = 'https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip';
const FFMPEG_URL = 'https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz';

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

function firstToken(text) {
    return text.trim().split(/\s+/)[0];
}

function isPresent(...names) {
    return !FORCE && names.every((name) => {
        return existsSync(join(BIN_DIR, name));
    });
}

async function fetchYtdlp() {
    if (isPresent('yt-dlp')) {
        return;
    }
    console.log('> yt-dlp');
    const sums = (await download(`${YTDLP_BASE}/SHA2-256SUMS`)).toString('utf-8');
    const expected = sums.split('\n').map((line) => {
        return line.trim().split(/\s+/);
    }).find(([, name]) => {
        return name === 'yt-dlp_linux';
    });
    if (!expected) {
        throw new Error('yt-dlp_linux not found in SHA2-256SUMS');
    }
    const binary = await download(`${YTDLP_BASE}/yt-dlp_linux`);
    verify('sha256', binary, expected[0], 'yt-dlp');
    const target = join(BIN_DIR, 'yt-dlp');
    writeFileSync(`${target}.tmp`, binary);
    chmodSync(`${target}.tmp`, 0o755);
    renameSync(`${target}.tmp`, target);
}

async function fetchDeno(workDir) {
    if (isPresent('deno')) {
        return;
    }
    console.log('> deno');
    const expected = firstToken((await download(`${DENO_URL}.sha256sum`)).toString('utf-8'));
    const archive = await download(DENO_URL);
    verify('sha256', archive, expected, 'deno');
    const archivePath = join(workDir, 'deno.zip');
    writeFileSync(archivePath, archive);
    execFileSync('unzip', ['-o', '-q', archivePath, 'deno', '-d', BIN_DIR]);
    chmodSync(join(BIN_DIR, 'deno'), 0o755);
}

async function fetchFfmpeg(workDir) {
    if (isPresent('ffmpeg', 'ffprobe')) {
        return;
    }
    console.log('> ffmpeg + ffprobe');
    const expected = firstToken((await download(`${FFMPEG_URL}.md5`)).toString('utf-8'));
    const archive = await download(FFMPEG_URL);
    verify('md5', archive, expected, 'ffmpeg');
    const archivePath = join(workDir, 'ffmpeg.tar.xz');
    writeFileSync(archivePath, archive);
    execFileSync('tar', ['-xJf', archivePath, '--wildcards', '--strip-components=1', '-C', BIN_DIR, '*/ffmpeg', '*/ffprobe', '*/GPLv3.txt']);
    rmSync(join(BIN_DIR, 'ffmpeg-GPLv3.txt'), { force: true });
    renameSync(join(BIN_DIR, 'GPLv3.txt'), join(BIN_DIR, 'ffmpeg-GPLv3.txt'));
}

async function main() {
    mkdirSync(BIN_DIR, { recursive: true });
    const workDir = mkdtempSync(join(tmpdir(), 'cyber-dl-bin-'));
    try {
        await fetchYtdlp();
        await fetchDeno(workDir);
        await fetchFfmpeg(workDir);
        console.log(`Binaries ready in ${BIN_DIR}`);
    } finally {
        rmSync(workDir, { recursive: true, force: true });
    }
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
