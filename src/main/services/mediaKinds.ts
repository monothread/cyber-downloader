import type { StreamKind } from '@shared/types';

const EXTENSION_KINDS: Record<string, StreamKind> = {
    m3u8: 'hls',
    mpd: 'dash',
    mp4: 'mp4',
    m4v: 'mp4',
    mov: 'mp4',
    webm: 'webm'
};

// Pieces of a stream (HLS/DASH segments, keys, subtitles). They are never a video on their own.
const SEGMENT_EXTENSIONS = new Set(['ts', 'm4s', 'm4f', 'm4a', 'aac', 'cmfv', 'cmfa', 'key', 'vtt', 'srt', 'mp3']);

const CONTENT_TYPE_KINDS: Array<[RegExp, StreamKind]> = [
    [/mpegurl/i, 'hls'],
    [/dash\+xml/i, 'dash'],
    [/^video\/mp4/i, 'mp4'],
    [/^video\/webm/i, 'webm'],
    [/^video\//i, 'other']
];

const SEGMENT_CONTENT_TYPES = /^video\/(mp2t|iso\.segment|vnd\.dlna\.mpeg-tts)/i;

export const MEDIA_EXTENSIONS = 'm3u8|mpd|mp4|webm|m4v|mov';

function extensionOf(url: string): string | null {
    try {
        const match = /\.([a-z0-9]+)$/.exec(new URL(url).pathname.toLowerCase());
        return match?.[1] ?? null;
    } catch {
        return null;
    }
}

export function isSegmentUrl(url: string): boolean {
    const extension = extensionOf(url);
    return extension !== null && SEGMENT_EXTENSIONS.has(extension);
}

export function kindFromUrl(url: string): StreamKind | null {
    const extension = extensionOf(url);
    return extension === null ? null : (EXTENSION_KINDS[extension] ?? null);
}

export function kindFromContentType(contentType: string | null | undefined): StreamKind | null {
    if (!contentType || SEGMENT_CONTENT_TYPES.test(contentType)) {
        return null;
    }
    const match = CONTENT_TYPE_KINDS.find(([pattern]) => {
        return pattern.test(contentType);
    });
    return match ? match[1] : null;
}

export function isHttpUrl(value: string): boolean {
    try {
        const protocol = new URL(value).protocol;
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

// A page found on the internet must not be able to make the app reach machines on the user's own network.
export function isPrivateHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
        return true;
    }
    if (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
        return host.includes(':');
    }
    const parts = host.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => {
        return !Number.isInteger(part) || part < 0 || part > 255;
    })) {
        return false;
    }
    const [first = 0, second = 0] = parts;
    return (
        first === 10 ||
        first === 127 ||
        first === 0 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 168)
    );
}

export function hostOf(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return '';
    }
}

export const STREAM_KIND_ORDER: readonly StreamKind[] = ['hls', 'dash', 'mp4', 'webm', 'other'];
