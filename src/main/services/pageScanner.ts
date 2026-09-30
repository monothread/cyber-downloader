import type { StreamKind } from '@shared/types';
import { MEDIA_EXTENSIONS, hostOf, isHttpUrl, isPrivateHost, kindFromUrl } from './mediaKinds';

export const STREAM_USER_AGENT =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
export const MAX_PAGES = 6;
export const MAX_IFRAME_DEPTH = 2;
export const MAX_CANDIDATES = 30;
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const PAGE_TIMEOUT_MS = 15000;

export interface PageFetchResult {
    html: string;
    finalUrl: string;
}

export interface ScanDependencies {
    fetchPage: (url: string, signal: AbortSignal) => Promise<PageFetchResult>;
}

export interface ScannedCandidate {
    url: string;
    kind: StreamKind;
    referer: string;
}

export interface ScanResult {
    candidates: ScannedCandidate[];
    title: string | null;
    pagesScanned: number;
    error: string | null;
}

interface PageToScan {
    url: string;
    depth: number;
}

const ABSOLUTE_MEDIA_URL = new RegExp(`https?:\\/\\/[^\\s"'<>\\\\)]+?\\.(?:${MEDIA_EXTENSIONS})(?![\\w-]|\\.\\w)(?:\\?[^\\s"'<>\\\\)]*)?`, 'gi');
const QUOTED_ROOT_PATH = new RegExp(`["'](\\/(?!\\/)[^"'\\s<>]*?\\.(?:${MEDIA_EXTENSIONS})(?![\\w-]|\\.\\w)(?:\\?[^"'\\s<>]*)?)["']`, 'gi');
const ATTRIBUTE_MEDIA_PATH = new RegExp(
    `(?:src|data-src|data-video|data-url|data-file|file|source)\\s*[=:]\\s*["']([^"'\\s<>]+?\\.(?:${MEDIA_EXTENSIONS})(?![\\w-]|\\.\\w)(?:\\?[^"'\\s<>]*)?)["']`,
    'gi'
);
const META_VIDEO = /<meta\s[^>]*?(?:property|name)\s*=\s*["'](?:og:video(?::url|:secure_url)?|twitter:player:stream|twitter:player)["'][^>]*?>/gi;
const IFRAME_SRC = /<iframe\s[^>]*?(?:src|data-src)\s*=\s*["']([^"']+)["']/gi;
const TITLE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const BASE_HREF = /<base\s[^>]*?href\s*=\s*["']([^"']+)["']/i;

function normalizeText(html: string): string {
    return html
        .replace(/\\u0026/gi, '&')
        .replace(/\\u002F/gi, '/')
        .replace(/\\\//g, '/')
        .replace(/&amp;/gi, '&');
}

function resolveUrl(value: string, baseUrl: string): string | null {
    try {
        const resolved = new URL(value.trim(), baseUrl);
        return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : null;
    } catch {
        return null;
    }
}

function allMatches(pattern: RegExp, text: string, group: number): string[] {
    return Array.from(text.matchAll(pattern), (match) => {
        return match[group] ?? '';
    });
}

function metaContent(tag: string): string | null {
    return /content\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? null;
}

export function documentBaseUrl(html: string, pageUrl: string): string {
    const href = BASE_HREF.exec(html)?.[1];
    return (href ? resolveUrl(href, pageUrl) : null) ?? pageUrl;
}

export function extractTitle(html: string): string | null {
    const raw = TITLE.exec(html)?.[1];
    if (!raw) {
        return null;
    }
    const title = raw
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
    return title.length > 0 ? title : null;
}

export function extractMediaUrls(html: string, pageUrl: string): string[] {
    const text = normalizeText(html);
    const base = documentBaseUrl(text, pageUrl);
    const found = [
        ...allMatches(ABSOLUTE_MEDIA_URL, text, 0),
        ...allMatches(QUOTED_ROOT_PATH, text, 1),
        ...allMatches(ATTRIBUTE_MEDIA_PATH, text, 1),
        ...allMatches(META_VIDEO, text, 0).flatMap((tag) => {
            const content = metaContent(tag);
            return content ? [content] : [];
        })
    ];
    const urls = found.flatMap((value) => {
        const resolved = resolveUrl(value, base);
        return resolved !== null && kindFromUrl(resolved) !== null ? [resolved] : [];
    });
    return Array.from(new Set(urls));
}

// Pages that may embed the player: iframes and og:video/twitter:player URLs that are not a media file themselves.
export function extractEmbeddedPages(html: string, pageUrl: string): string[] {
    const text = normalizeText(html);
    const base = documentBaseUrl(text, pageUrl);
    const metaPages = allMatches(META_VIDEO, text, 0).flatMap((tag) => {
        const content = metaContent(tag);
        return content ? [content] : [];
    });
    const pages = [...allMatches(IFRAME_SRC, text, 1), ...metaPages].flatMap((value) => {
        const resolved = resolveUrl(value, base);
        return resolved !== null && kindFromUrl(resolved) === null ? [resolved] : [];
    });
    return Array.from(new Set(pages));
}

function isAllowedHost(url: string, rootHost: string): boolean {
    const host = hostOf(url);
    return !isPrivateHost(host) || isPrivateHost(rootHost);
}

export async function scanPage(rootUrl: string, deps: ScanDependencies, signal: AbortSignal): Promise<ScanResult> {
    const rootHost = hostOf(rootUrl);
    const queue: PageToScan[] = [{ url: rootUrl, depth: 0 }];
    const visited = new Set<string>();
    const candidates = new Map<string, ScannedCandidate>();
    let title: string | null = null;
    let pagesScanned = 0;
    let error: string | null = null;

    while (queue.length > 0 && pagesScanned < MAX_PAGES && !signal.aborted) {
        const page = queue.shift();
        if (!page || visited.has(page.url)) {
            continue;
        }
        visited.add(page.url);
        try {
            const { html, finalUrl } = await deps.fetchPage(page.url, signal);
            pagesScanned += 1;
            title = page.depth === 0 ? extractTitle(html) : title;
            for (const url of extractMediaUrls(html, finalUrl)) {
                const kind = kindFromUrl(url);
                if (kind !== null && isAllowedHost(url, rootHost) && candidates.size < MAX_CANDIDATES && !candidates.has(url)) {
                    candidates.set(url, { url, kind, referer: finalUrl });
                }
            }
            if (page.depth < MAX_IFRAME_DEPTH) {
                extractEmbeddedPages(html, finalUrl)
                    .filter((embedded) => {
                        return isAllowedHost(embedded, rootHost);
                    })
                    .forEach((embedded) => {
                        queue.push({ url: embedded, depth: page.depth + 1 });
                    });
            }
        } catch (caught) {
            if (page.depth === 0) {
                error = caught instanceof Error ? caught.message : 'The page could not be loaded.';
            }
        }
    }
    return { candidates: Array.from(candidates.values()), title, pagesScanned, error };
}

export async function defaultFetchPage(url: string, signal: AbortSignal): Promise<PageFetchResult> {
    if (!isHttpUrl(url)) {
        throw new Error('Only http(s) pages can be scanned.');
    }
    const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.any([signal, AbortSignal.timeout(PAGE_TIMEOUT_MS)]),
        headers: { 'User-Agent': STREAM_USER_AGENT, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' }
    });
    if (!response.ok) {
        throw new Error(`The page answered with HTTP ${response.status}.`);
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!/(html|xml|text\/|json|javascript)/i.test(contentType)) {
        throw new Error('The address is not a web page.');
    }
    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > MAX_PAGE_BYTES) {
        throw new Error('The page is too large to scan.');
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    return { html: buffer.subarray(0, MAX_PAGE_BYTES).toString('utf-8'), finalUrl: response.url || url };
}
