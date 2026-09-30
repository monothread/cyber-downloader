import type { StreamKind } from '@shared/types';

// Two addresses count as the same stream when they share at least this many query parameters with the same value...
export const MIN_SHARED_PARAMETERS = 4;
// ...and those shared parameters make up at least this fraction of the shorter address's parameters.
export const SIMILARITY_THRESHOLD = 0.6;

// Parameters that say *which* video (or which quality of it) an address serves. A different value in any of them
// means a different stream, however many routine parameters (mime type, source...) the two addresses share.
export const IDENTITY_PARAMETERS: ReadonlySet<string> = new Set([
    'id',
    'sig',
    'signature',
    'token',
    'hash',
    'key',
    'v',
    'vid',
    'video',
    'video_id',
    'videoid',
    'file',
    'fid',
    'itag',
    'format',
    'quality'
]);

export interface GroupableStream {
    url: string;
    kind: StreamKind;
}

export interface StreamGroup<T extends GroupableStream> {
    stream: T;
    duplicates: number;
}

interface Fingerprint {
    url: string;
    kind: StreamKind;
    host: string;
    path: string;
    pairs: Set<string>;
    values: Map<string, string>;
}

function fingerprintOf(stream: GroupableStream): Fingerprint {
    try {
        const parsed = new URL(stream.url);
        const pairs = new Set<string>();
        const values = new Map<string, string>();
        parsed.searchParams.forEach((value, key) => {
            pairs.add(`${key}=${value}`);
            values.set(key, value);
        });
        return { url: stream.url, kind: stream.kind, host: parsed.hostname, path: parsed.pathname, pairs, values };
    } catch {
        return { url: stream.url, kind: stream.kind, host: '', path: stream.url, pairs: new Set(), values: new Map() };
    }
}

function hasConflictingIdentity(first: Fingerprint, second: Fingerprint): boolean {
    return Array.from(IDENTITY_PARAMETERS).some((name) => {
        const left = first.values.get(name);
        const right = second.values.get(name);
        return left !== undefined && right !== undefined && left !== right;
    });
}

function isSameStream(first: Fingerprint, second: Fingerprint): boolean {
    if (first.url === second.url) {
        return true;
    }
    if (first.kind !== second.kind || first.path !== second.path) {
        return false;
    }
    const smaller = Math.min(first.pairs.size, second.pairs.size);
    if (smaller === 0 || hasConflictingIdentity(first, second)) {
        return false;
    }
    let shared = 0;
    first.pairs.forEach((pair) => {
        if (second.pairs.has(pair)) {
            shared += 1;
        }
    });
    return shared >= MIN_SHARED_PARAMETERS && shared / smaller >= SIMILARITY_THRESHOLD;
}

// Streaming hosts often answer the same request from several servers (mirrors, redirects that append session
// parameters), so one video shows up as several almost identical addresses. They are listed once: the first one
// seen, which is the address the page itself asked for, with the number of variants that were folded into it.
export function groupSimilarStreams<T extends GroupableStream>(streams: T[]): Array<StreamGroup<T>> {
    const groups: Array<{ stream: T; members: Fingerprint[] }> = [];
    streams.forEach((stream) => {
        const fingerprint = fingerprintOf(stream);
        const group = groups.find((candidate) => {
            return candidate.members.some((member) => {
                return isSameStream(member, fingerprint);
            });
        });
        if (group) {
            group.members.push(fingerprint);
        } else {
            groups.push({ stream, members: [fingerprint] });
        }
    });
    return groups.map((group) => {
        return { stream: group.stream, duplicates: group.members.length - 1 };
    });
}
