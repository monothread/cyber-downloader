import { randomUUID } from 'node:crypto';
import type { StreamCandidate, StreamFindResult, StreamFindStage, StreamKind, StreamSource } from '@shared/types';
import type { SniffResult } from './browserSniffer';
import { STREAM_KIND_ORDER, hostOf } from './mediaKinds';
import { groupSimilarStreams, type StreamGroup } from './streamGrouping';
import { STREAM_USER_AGENT, type ScanResult } from './pageScanner';

export const NOTHING_FOUND_MESSAGE =
    'No video stream was found. The video may be protected by DRM, need a login, or start only after an action that the app cannot do.';
export const CANCELLED_MESSAGE = 'Search cancelled.';

export interface StreamFinderDependencies {
    scan: (url: string, signal: AbortSignal) => Promise<ScanResult>;
    sniff: (url: string, signal: AbortSignal) => Promise<SniffResult>;
    // Optional clean-up of the streams found (e.g. dropping quality variants of a master playlist).
    refine?: <T extends { url: string; kind: StreamKind; referer: string }>(streams: T[]) => Promise<T[]>;
    generateId?: () => string;
}

// What the download needs to fetch the stream like the page would have. It stays in the main process:
// the screen only sees the StreamCandidate part.
export interface StoredStream extends StreamCandidate {
    referer: string;
    userAgent: string;
    cookie: string | null;
}

interface RawStream {
    url: string;
    kind: StreamKind;
    referer: string;
    cookie: string | null;
}

export class StreamFinder {
    private readonly stored = new Map<string, StoredStream>();
    private readonly idsByJob = new Map<string, string[]>();
    private readonly running = new Map<string, AbortController>();
    private readonly generateId: () => string;

    constructor(private readonly deps: StreamFinderDependencies) {
        this.generateId = deps.generateId ?? randomUUID;
    }

    getCandidate(id: string): StoredStream | undefined {
        return this.stored.get(id);
    }

    cancel(jobId: string): void {
        this.running.get(jobId)?.abort();
    }

    async find(jobId: string, pageUrl: string, deep: boolean, onStage: (stage: StreamFindStage) => void): Promise<StreamFindResult> {
        this.cancel(jobId);
        this.forget(jobId);
        const controller = new AbortController();
        this.running.set(jobId, controller);
        let usedBrowser = false;
        try {
            onStage('scanning');
            const scan = await this.deps.scan(pageUrl, controller.signal);
            const raw = new Map<string, RawStream & { source: StreamSource }>();
            scan.candidates.forEach((candidate) => {
                raw.set(candidate.url, { ...candidate, cookie: null, source: 'page' });
            });
            let title = scan.title;
            let browserError: string | null = null;
            if (!controller.signal.aborted && (deep || raw.size === 0)) {
                usedBrowser = true;
                onStage('watching');
                // The user may cancel while the screen is being told about the new stage.
                if (!controller.signal.aborted) {
                    const sniffed = await this.deps.sniff(pageUrl, controller.signal);
                    title = title ?? sniffed.title;
                    browserError = sniffed.error;
                    sniffed.streams.forEach((stream) => {
                        if (!raw.has(stream.url)) {
                            raw.set(stream.url, { ...stream, source: 'network' });
                        }
                    });
                }
            }
            if (controller.signal.aborted) {
                return { ok: false, candidates: [], message: CANCELLED_MESSAGE, usedBrowser };
            }
            const refined = await this.refine(Array.from(raw.values()));
            const candidates = this.store(jobId, groupSimilarStreams(refined), title);
            return { ok: candidates.length > 0, candidates, message: candidates.length > 0 ? null : this.emptyMessage(scan.error, browserError), usedBrowser };
        } catch (error) {
            return { ok: false, candidates: [], message: error instanceof Error ? error.message : 'The search failed.', usedBrowser };
        } finally {
            if (this.running.get(jobId) === controller) {
                this.running.delete(jobId);
            }
        }
    }

    private async refine<T extends RawStream>(streams: T[]): Promise<T[]> {
        if (!this.deps.refine) {
            return streams;
        }
        try {
            return await this.deps.refine(streams);
        } catch {
            return streams;
        }
    }

    private emptyMessage(scanError: string | null, browserError: string | null): string {
        const pageError = scanError !== null && browserError !== null ? browserError : null;
        return pageError ?? NOTHING_FOUND_MESSAGE;
    }

    private forget(jobId: string): void {
        this.idsByJob.get(jobId)?.forEach((id) => {
            this.stored.delete(id);
        });
        this.idsByJob.delete(jobId);
    }

    private store(jobId: string, groups: Array<StreamGroup<RawStream & { source: StreamSource }>>, title: string | null): StreamCandidate[] {
        const ordered = [...groups].sort((first, second) => {
            return STREAM_KIND_ORDER.indexOf(first.stream.kind) - STREAM_KIND_ORDER.indexOf(second.stream.kind);
        });
        const ids: string[] = [];
        const candidates = ordered.map(({ stream, duplicates }) => {
            const id = this.generateId();
            const candidate: StreamCandidate = { id, url: stream.url, kind: stream.kind, source: stream.source, host: hostOf(stream.url), title, duplicates };
            this.stored.set(id, { ...candidate, referer: stream.referer, userAgent: STREAM_USER_AGENT, cookie: stream.cookie });
            ids.push(id);
            return candidate;
        });
        this.idsByJob.set(jobId, ids);
        return candidates;
    }
}
