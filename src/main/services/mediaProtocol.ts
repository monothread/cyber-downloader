import { createReadStream, statSync } from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { ANIME_MEDIA_SCHEME, type AnimeMediaKind } from '@shared/anime';

export { ANIME_MEDIA_SCHEME };

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;
const CONTENT_TYPES: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.vtt': 'text/vtt; charset=utf-8'
};

export interface ByteRange {
    start: number;
    end: number;
}

export interface MediaFileSystem {
    // The size of a file, or null when it is not there.
    size: (path: string) => number | null;
    // The bytes from `start` to `end` (both included).
    read: (path: string, range: ByteRange) => ReadableStream<Uint8Array>;
}

export interface MediaSource {
    // The file of an episode (its video or its subtitles), or null when there is none to serve.
    resolve: (kind: AnimeMediaKind, episodeId: number) => string | null;
}

// A single "bytes=start-end" range. null: no range was asked. 'invalid': it cannot be satisfied (HTTP 416).
export function parseRange(header: string | null, size: number): ByteRange | 'invalid' | null {
    if (header === null) {
        return null;
    }
    const match = RANGE_PATTERN.exec(header.trim());
    if (!match || (match[1] === '' && match[2] === '')) {
        return 'invalid';
    }
    if (match[1] === '') {
        // "bytes=-500": the last 500 bytes.
        const suffix = Number(match[2]);
        return suffix === 0 ? 'invalid' : { start: Math.max(0, size - suffix), end: size - 1 };
    }
    const start = Number(match[1]);
    const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    return start >= size || start > end ? 'invalid' : { start, end };
}

export function contentTypeOf(path: string): string {
    return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

// The player asks for `pullwave-media://episode/<id>` (the video) and `pullwave-media://subtitle/<id>` (its .vtt).
export function parseMediaUrl(url: string): { kind: AnimeMediaKind; episodeId: number } | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }
    const episodeId = /^\/(\d+)$/.exec(parsed.pathname)?.[1];
    if (parsed.protocol !== `${ANIME_MEDIA_SCHEME}:` || episodeId === undefined) {
        return null;
    }
    if (parsed.hostname !== 'episode' && parsed.hostname !== 'subtitle') {
        return null;
    }
    return { kind: parsed.hostname, episodeId: Number(episodeId) };
}

function plain(status: number, headers: Record<string, string> = {}): Response {
    return new Response(null, { status, headers: { 'Access-Control-Allow-Origin': '*', ...headers } });
}

// Serves a downloaded file with support for ranges, which is what lets the player seek. Only files that belong to an
// episode of the library are reachable: the address carries an id, never a path.
export function createMediaHandler(source: MediaSource, files: MediaFileSystem): (request: Request) => Response {
    return (request) => {
        const media = parseMediaUrl(request.url);
        const path = media ? source.resolve(media.kind, media.episodeId) : null;
        const size = path === null ? null : files.size(path);
        if (path === null || size === null) {
            return plain(404);
        }
        const range = parseRange(request.headers.get('range'), size);
        if (range === 'invalid') {
            return plain(416, { 'Content-Range': `bytes */${size}` });
        }
        const headers = { 'Content-Type': contentTypeOf(path), 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
        if (range === null && size === 0) {
            return new Response(null, { status: 200, headers: { ...headers, 'Content-Length': '0' } });
        }
        if (range === null) {
            return new Response(files.read(path, { start: 0, end: size - 1 }), { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
        }
        return new Response(files.read(path, range), {
            status: 206,
            headers: { ...headers, 'Content-Length': String(range.end - range.start + 1), 'Content-Range': `bytes ${range.start}-${range.end}/${size}` }
        });
    };
}

export const defaultMediaFileSystem: MediaFileSystem = {
    size: (path) => {
        try {
            const stats = statSync(path);
            return stats.isFile() ? stats.size : null;
        } catch {
            return null;
        }
    },
    read: (path, range) => {
        return Readable.toWeb(createReadStream(path, range)) as ReadableStream<Uint8Array>;
    }
};
