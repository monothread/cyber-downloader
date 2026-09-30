import type { StreamKind } from '@shared/types';
import { isHttpUrl } from './mediaKinds';
import { STREAM_USER_AGENT } from './pageScanner';

export const PLAYLIST_TIMEOUT_MS = 8000;
export const MAX_PLAYLIST_BYTES = 512 * 1024;

export interface PlaylistStream {
    url: string;
    kind: StreamKind;
    referer: string;
}

function resolveAgainst(reference: string, playlistUrl: string): string | null {
    try {
        const resolved = new URL(reference, playlistUrl).href;
        return isHttpUrl(resolved) ? resolved : null;
    } catch {
        return null;
    }
}

// A master HLS playlist lists the quality variants of one video. Returns those variants (empty for anything else).
export function variantUrlsOf(body: string, playlistUrl: string): string[] {
    if (!body.includes('#EXT-X-STREAM-INF')) {
        return [];
    }
    const lines = body.split(/\r?\n/).map((line) => {
        return line.trim();
    });
    const references: string[] = [];
    lines.forEach((line, index) => {
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            const next = lines.slice(index + 1).find((candidate) => {
                return candidate.length > 0 && !candidate.startsWith('#');
            });
            if (next) {
                references.push(next);
            }
        } else if (line.startsWith('#EXT-X-MEDIA') || line.startsWith('#EXT-X-I-FRAME-STREAM-INF')) {
            const uri = /URI="([^"]+)"/.exec(line)?.[1];
            if (uri) {
                references.push(uri);
            }
        }
    });
    return references.flatMap((reference) => {
        const resolved = resolveAgainst(reference, playlistUrl);
        return resolved ? [resolved] : [];
    });
}

// Drops the HLS playlists that a master playlist found in the same list already covers, so the user sees the
// video once instead of once per quality. Anything that cannot be read is kept.
export async function dropVariantPlaylists<T extends PlaylistStream>(
    streams: T[],
    fetchPlaylist: (url: string, referer: string) => Promise<string>
): Promise<T[]> {
    const variants = new Set<string>();
    await Promise.all(
        streams
            .filter((stream) => {
                return stream.kind === 'hls';
            })
            .map(async (stream) => {
                try {
                    variantUrlsOf(await fetchPlaylist(stream.url, stream.referer), stream.url).forEach((variant) => {
                        variants.add(variant);
                    });
                } catch {
                    return undefined;
                }
                return undefined;
            })
    );
    return streams.filter((stream) => {
        return !variants.has(stream.url);
    });
}

export async function defaultFetchPlaylist(url: string, referer: string): Promise<string> {
    const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(PLAYLIST_TIMEOUT_MS),
        headers: { 'User-Agent': STREAM_USER_AGENT, Referer: referer }
    });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return (await response.text()).slice(0, MAX_PLAYLIST_BYTES);
}
