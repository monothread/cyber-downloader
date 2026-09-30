import type { StreamFindStage } from '@shared/types';
import type { SniffResult } from '@main/services/browserSniffer';
import type { StreamFinderDependencies } from '@main/services/streamFinder';
import type { ScanResult } from '@main/services/pageScanner';
import { STREAM_USER_AGENT } from '@main/services/pageScanner';
import { CANCELLED_MESSAGE, NOTHING_FOUND_MESSAGE, StreamFinder } from '@main/services/streamFinder';

const PAGE = 'https://site.test/watch/ep-1';

function scanResult(overrides: Partial<ScanResult> = {}): ScanResult {
    return { candidates: [], title: null, pagesScanned: 1, error: null, ...overrides };
}

function sniffResult(overrides: Partial<SniffResult> = {}): SniffResult {
    return { streams: [], title: null, error: null, ...overrides };
}

function setup(scan: ScanResult | (() => Promise<ScanResult>), sniff: SniffResult | (() => Promise<SniffResult>) = sniffResult(), refine?: StreamFinderDependencies['refine']) {
    let counter = 0;
    const scanFn = vi.fn<StreamFinderDependencies['scan']>(async () => {
        return typeof scan === 'function' ? scan() : scan;
    });
    const sniffFn = vi.fn<StreamFinderDependencies['sniff']>(async () => {
        return typeof sniff === 'function' ? sniff() : sniff;
    });
    const finder = new StreamFinder({
        scan: scanFn,
        sniff: sniffFn,
        refine,
        generateId: () => {
            counter += 1;
            return `id-${counter}`;
        }
    });
    const stages: StreamFindStage[] = [];
    const find = (jobId = 'job-1', deep = false) => {
        return finder.find(jobId, PAGE, deep, (stage) => {
            stages.push(stage);
        });
    };
    return { finder, scanFn, sniffFn, stages, find };
}

const PAGE_MP4 = { url: 'https://cdn.test/a.mp4', kind: 'mp4' as const, referer: PAGE };
const PAGE_HLS = { url: 'https://cdn.test/b.m3u8', kind: 'hls' as const, referer: 'https://player.test/embed' };
const NET_DASH = { url: 'https://cdn.test/c.mpd', kind: 'dash' as const, referer: PAGE, cookie: 'sid=1' };

describe('StreamFinder.find', () => {
    it('returns what the static scan found and does not start the browser', async () => {
        const { find, scanFn, sniffFn, stages } = setup(scanResult({ candidates: [PAGE_MP4], title: 'Episode 1' }));
        const result = await find();
        expect(result).toEqual({
            ok: true,
            candidates: [{ id: 'id-1', url: 'https://cdn.test/a.mp4', kind: 'mp4', source: 'page', host: 'cdn.test', title: 'Episode 1' }],
            message: null,
            usedBrowser: false
        });
        expect(scanFn).toHaveBeenCalledWith(PAGE, expect.any(AbortSignal));
        expect(sniffFn).not.toHaveBeenCalled();
        expect(stages).toEqual(['scanning']);
    });

    it('falls back to the hidden browser when the static scan finds nothing', async () => {
        const { find, sniffFn, stages } = setup(scanResult({ title: 'Page' }), sniffResult({ streams: [NET_DASH] }));
        const result = await find();
        expect(result).toEqual({
            ok: true,
            candidates: [{ id: 'id-1', url: 'https://cdn.test/c.mpd', kind: 'dash', source: 'network', host: 'cdn.test', title: 'Page' }],
            message: null,
            usedBrowser: true
        });
        expect(sniffFn).toHaveBeenCalledWith(PAGE, expect.any(AbortSignal));
        expect(stages).toEqual(['scanning', 'watching']);
    });

    it('uses the title seen by the browser when the page has none in its HTML', async () => {
        const { find } = setup(scanResult(), sniffResult({ streams: [NET_DASH], title: 'Rendered title' }));
        expect((await find()).candidates[0]?.title).toBe('Rendered title');
    });

    it('searches deeper on request even when the scan found something, merging without duplicates', async () => {
        const { find, sniffFn } = setup(
            scanResult({ candidates: [PAGE_MP4] }),
            sniffResult({ streams: [{ ...PAGE_MP4, cookie: 'other=1' }, NET_DASH] })
        );
        const result = await find('job-1', true);
        expect(sniffFn).toHaveBeenCalledTimes(1);
        expect(result.usedBrowser).toBe(true);
        expect(result.candidates.map((candidate) => {
            return [candidate.url, candidate.source];
        })).toEqual([
            ['https://cdn.test/c.mpd', 'network'],
            ['https://cdn.test/a.mp4', 'page']
        ]);
    });

    it('lists playlists before plain files', async () => {
        const { find } = setup(scanResult({ candidates: [PAGE_MP4, PAGE_HLS] }));
        expect((await find()).candidates.map((candidate) => {
            return candidate.kind;
        })).toEqual(['hls', 'mp4']);
    });

    it('explains when nothing was found anywhere', async () => {
        const { find } = setup(scanResult(), sniffResult());
        await expect(find()).resolves.toEqual({ ok: false, candidates: [], message: NOTHING_FOUND_MESSAGE, usedBrowser: true });
    });

    it('reports the load error when the page could not be opened by either method', async () => {
        const { find } = setup(scanResult({ error: 'HTTP 404' }), sniffResult({ error: 'The page could not be loaded (ERR_NAME_NOT_RESOLVED).' }));
        expect((await find()).message).toBe('The page could not be loaded (ERR_NAME_NOT_RESOLVED).');
    });

    it('keeps the generic message when only the static fetch failed', async () => {
        const { find } = setup(scanResult({ error: 'HTTP 403' }), sniffResult());
        expect((await find()).message).toBe(NOTHING_FOUND_MESSAGE);
    });

    it('still finds streams with the browser when the static fetch was blocked', async () => {
        const { find } = setup(scanResult({ error: 'HTTP 403' }), sniffResult({ streams: [NET_DASH] }));
        expect((await find()).ok).toBe(true);
    });

    it('turns unexpected failures into a message', async () => {
        const failing = setup(async () => {
            throw new Error('scan exploded');
        });
        await expect(failing.find()).resolves.toEqual({ ok: false, candidates: [], message: 'scan exploded', usedBrowser: false });
        const odd = setup(async () => {
            throw 'weird';
        });
        expect((await odd.find()).message).toBe('The search failed.');
    });
});

describe('StreamFinder refine step', () => {
    it('lets the refine step drop streams before they are shown and stored', async () => {
        const refine: StreamFinderDependencies['refine'] = async (streams) => {
            return streams.filter((stream) => {
                return stream.kind !== 'hls';
            });
        };
        const { find, finder } = setup(scanResult({ candidates: [PAGE_HLS, PAGE_MP4] }), sniffResult(), refine);
        const result = await find();
        expect(result.candidates.map((candidate) => {
            return candidate.kind;
        })).toEqual(['mp4']);
        expect(finder.getCandidate('id-1')?.url).toBe('https://cdn.test/a.mp4');
        expect(finder.getCandidate('id-2')).toBeUndefined();
    });

    it('sees streams from the page and from the network together', async () => {
        const seen: string[][] = [];
        const refine: StreamFinderDependencies['refine'] = async (streams) => {
            seen.push(streams.map((stream) => {
                return stream.url;
            }));
            return streams;
        };
        const { find } = setup(scanResult({ candidates: [PAGE_MP4] }), sniffResult({ streams: [NET_DASH] }), refine);
        await find('job-1', true);
        expect(seen).toEqual([['https://cdn.test/a.mp4', 'https://cdn.test/c.mpd']]);
    });

    it('keeps every stream when the refine step fails', async () => {
        const refine: StreamFinderDependencies['refine'] = async () => {
            throw new Error('refine exploded');
        };
        const { find } = setup(scanResult({ candidates: [PAGE_HLS, PAGE_MP4] }), sniffResult(), refine);
        expect((await find()).candidates).toHaveLength(2);
    });

    it('reports nothing found when the refine step removes everything', async () => {
        const refine: StreamFinderDependencies['refine'] = async () => {
            return [];
        };
        const { find } = setup(scanResult({ candidates: [PAGE_MP4] }), sniffResult(), refine);
        expect(await find()).toMatchObject({ ok: false, candidates: [], message: NOTHING_FOUND_MESSAGE });
    });
});

describe('StreamFinder candidates', () => {
    it('keeps the request details for the download inside the main process', async () => {
        const { find, finder } = setup(scanResult({ candidates: [PAGE_HLS], title: 'Ep' }), sniffResult());
        const [candidate] = (await find()).candidates;
        expect(candidate).not.toHaveProperty('referer');
        expect(candidate).not.toHaveProperty('cookie');
        expect(finder.getCandidate(candidate?.id ?? '')).toEqual({
            id: 'id-1',
            url: 'https://cdn.test/b.m3u8',
            kind: 'hls',
            source: 'page',
            host: 'cdn.test',
            title: 'Ep',
            referer: 'https://player.test/embed',
            userAgent: STREAM_USER_AGENT,
            cookie: null
        });
    });

    it('keeps the cookies the page received for a network stream', async () => {
        const { find, finder } = setup(scanResult(), sniffResult({ streams: [NET_DASH] }));
        const [candidate] = (await find()).candidates;
        expect(finder.getCandidate(candidate?.id ?? '')).toMatchObject({ referer: PAGE, cookie: 'sid=1', source: 'network' });
    });

    it('returns undefined for unknown ids', () => {
        expect(setup(scanResult()).finder.getCandidate('nope')).toBeUndefined();
    });

    it('forgets the previous candidates of a job when it searches again, but keeps other jobs', async () => {
        const { find, finder } = setup(scanResult({ candidates: [PAGE_MP4] }));
        const first = (await find('job-1')).candidates[0]?.id ?? '';
        const other = (await find('job-2')).candidates[0]?.id ?? '';
        const second = (await find('job-1')).candidates[0]?.id ?? '';
        expect(finder.getCandidate(first)).toBeUndefined();
        expect(finder.getCandidate(second)).toBeDefined();
        expect(finder.getCandidate(other)).toBeDefined();
    });
});

describe('StreamFinder.cancel', () => {
    it('aborts a running search and reports it as cancelled', async () => {
        let release: () => void = () => {
            return undefined;
        };
        const finder = new StreamFinder({
            scan: (_url, signal) => {
                return new Promise<ScanResult>((resolve) => {
                    release = () => {
                        resolve(scanResult());
                    };
                    signal.addEventListener('abort', release);
                });
            },
            sniff: async () => {
                return sniffResult({ streams: [NET_DASH] });
            }
        });
        const search = finder.find('job-1', PAGE, false, () => {
            return undefined;
        });
        finder.cancel('job-1');
        await expect(search).resolves.toEqual({ ok: false, candidates: [], message: CANCELLED_MESSAGE, usedBrowser: false });
    });

    it('does not start the browser after a cancelled scan', async () => {
        const sniff = vi.fn(async () => {
            return sniffResult();
        });
        const finder = new StreamFinder({
            scan: (_url, signal) => {
                return new Promise<ScanResult>((resolve) => {
                    signal.addEventListener('abort', () => {
                        resolve(scanResult());
                    });
                });
            },
            sniff
        });
        const search = finder.find('job-1', PAGE, false, () => {
            return undefined;
        });
        finder.cancel('job-1');
        await search;
        expect(sniff).not.toHaveBeenCalled();
    });

    it('reports a search that was cancelled while the browser was watching', async () => {
        const finder = new StreamFinder({
            scan: async () => {
                return scanResult();
            },
            sniff: (_url, signal) => {
                return new Promise<SniffResult>((resolve) => {
                    signal.addEventListener('abort', () => {
                        resolve(sniffResult({ streams: [NET_DASH] }));
                    });
                });
            }
        });
        const search = finder.find('job-1', PAGE, false, (stage) => {
            if (stage === 'watching') {
                finder.cancel('job-1');
            }
        });
        await expect(search).resolves.toEqual({ ok: false, candidates: [], message: CANCELLED_MESSAGE, usedBrowser: true });
    });

    it('does nothing for a job that is not searching', () => {
        expect(() => {
            setup(scanResult()).finder.cancel('nothing');
        }).not.toThrow();
    });

    it('cancels the previous search of the same job when a new one starts', async () => {
        const signals: AbortSignal[] = [];
        const finder = new StreamFinder({
            scan: (_url, signal) => {
                signals.push(signal);
                return new Promise<ScanResult>((resolve) => {
                    signal.addEventListener('abort', () => {
                        resolve(scanResult());
                    });
                    if (signals.length === 2) {
                        resolve(scanResult({ candidates: [PAGE_MP4] }));
                    }
                });
            },
            sniff: async () => {
                return sniffResult();
            }
        });
        const first = finder.find('job-1', PAGE, false, () => {
            return undefined;
        });
        const second = finder.find('job-1', PAGE, false, () => {
            return undefined;
        });
        await expect(first).resolves.toMatchObject({ ok: false, message: CANCELLED_MESSAGE });
        await expect(second).resolves.toMatchObject({ ok: true });
        expect(signals[0]?.aborted).toBe(true);
        expect(signals[1]?.aborted).toBe(false);
    });
});
