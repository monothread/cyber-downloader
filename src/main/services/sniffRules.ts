import type { StreamKind } from '@shared/types';
import { isHttpUrl, isSegmentUrl, kindFromContentType, kindFromUrl } from './mediaKinds';

export const MIN_MEDIA_BYTES_WITHOUT_EXTENSION = 100_000;

export type BlockedResourceType = 'image' | 'font' | 'ping';

const BLOCKED_RESOURCE_TYPES: ReadonlySet<string> = new Set<BlockedResourceType>(['image', 'font', 'ping']);

// Big media files are cancelled as soon as they are seen: only the address matters, and the page must not
// spend the user's bandwidth. Small playlists (hls/dash) are let through so the player keeps asking for more.
const CANCEL_AFTER_SEEING: ReadonlySet<StreamKind> = new Set<StreamKind>(['mp4', 'webm', 'other']);

export interface RequestDecision {
    cancel: boolean;
    kind: StreamKind | null;
}

export function classifyRequest(url: string, resourceType: string): RequestDecision {
    if (!isHttpUrl(url) || BLOCKED_RESOURCE_TYPES.has(resourceType)) {
        return { cancel: BLOCKED_RESOURCE_TYPES.has(resourceType), kind: null };
    }
    if (isSegmentUrl(url)) {
        return { cancel: true, kind: null };
    }
    const kind = kindFromUrl(url);
    return { cancel: kind !== null && CANCEL_AFTER_SEEING.has(kind), kind };
}

export interface ResponseDecision {
    cancel: boolean;
    kind: StreamKind | null;
}

// Media served from an address without a telling extension is recognised by its content type.
export function classifyResponse(url: string, contentType: string | null | undefined, contentLength: number | null): ResponseDecision {
    if (!isHttpUrl(url) || isSegmentUrl(url)) {
        return { cancel: false, kind: null };
    }
    const kind = kindFromContentType(contentType);
    if (kind === null) {
        return { cancel: false, kind: null };
    }
    const tooSmall = CANCEL_AFTER_SEEING.has(kind) && kindFromUrl(url) === null && contentLength !== null && contentLength < MIN_MEDIA_BYTES_WITHOUT_EXTENSION;
    return tooSmall ? { cancel: false, kind: null } : { cancel: CANCEL_AFTER_SEEING.has(kind), kind };
}
