import {
    MAX_CANDIDATES,
    MAX_IFRAME_DEPTH,
    MAX_PAGES,
    MAX_PAGE_BYTES,
    STREAM_USER_AGENT,
    defaultFetchPage,
    documentBaseUrl,
    extractEmbeddedPages,
    extractMediaUrls,
    extractTitle,
    scanPage,
    type PageFetchResult
} from '@main/services/pageScanner';

afterEach(() => {
    vi.unstubAllGlobals();
});

const PAGE = 'https://site.test/watch/ep-1';

describe('extractTitle', () => {
    it('reads, decodes and tidies the title', () => {
        expect(extractTitle('<html><head><title>\n  Show &amp; Tell:   &quot;One&quot; &#39;x&#39; &lt;b&gt;\n</title>')).toBe('Show & Tell: "One" \'x\' <b>');
    });

    it('returns null when there is no usable title', () => {
        expect(extractTitle('<html></html>')).toBeNull();
        expect(extractTitle('<title>   </title>')).toBeNull();
    });

    it('caps the length', () => {
        expect(extractTitle(`<title>${'a'.repeat(500)}</title>`)).toHaveLength(200);
    });
});

describe('documentBaseUrl', () => {
    it('uses <base href> when present and valid', () => {
        expect(documentBaseUrl('<base href="https://cdn.test/base/">', PAGE)).toBe('https://cdn.test/base/');
        expect(documentBaseUrl('<base href="/root/">', PAGE)).toBe('https://site.test/root/');
    });

    it('falls back to the page address', () => {
        expect(documentBaseUrl('<p>none</p>', PAGE)).toBe(PAGE);
        expect(documentBaseUrl('<base href="javascript:x">', PAGE)).toBe(PAGE);
    });
});

describe('extractMediaUrls', () => {
    it('finds absolute media links in markup and scripts', () => {
        const html = `
            <video src="https://cdn.test/a/clip.mp4"></video>
            <script>player.load("https://cdn.test/hls/master.m3u8?sig=abc&exp=9");</script>
            <script>var dash = 'https://cdn.test/d/manifest.mpd';</script>
            <a href="https://cdn.test/w/movie.webm">x</a>`;
        expect(extractMediaUrls(html, PAGE)).toEqual([
            'https://cdn.test/a/clip.mp4',
            'https://cdn.test/hls/master.m3u8?sig=abc&exp=9',
            'https://cdn.test/d/manifest.mpd',
            'https://cdn.test/w/movie.webm'
        ]);
    });

    it('does not take a file that merely contains a media extension in the middle', () => {
        expect(extractMediaUrls('<img src="https://cdn.test/clip.mp4.jpg"><a href="https://cdn.test/movie.mp4-thumb.png">', PAGE)).toEqual([]);
    });

    it('decodes JSON-escaped addresses', () => {
        const html = String.raw`{"hls":"https:\/\/cdn.test\/v\/master.m3u8?t=1&x=2","alt":"https://cdn.test/v/a.mp4?a=1&amp;b=2"}`;
        expect(extractMediaUrls(html, PAGE)).toEqual(['https://cdn.test/v/master.m3u8?t=1&x=2', 'https://cdn.test/v/a.mp4?a=1&b=2']);
    });

    it('resolves relative sources against the page', () => {
        const html = '<video><source src="video/clip.mp4" type="video/mp4"></video><script>var f = "/media/list.m3u8";</script>';
        expect(extractMediaUrls(html, PAGE)).toEqual(['https://site.test/media/list.m3u8', 'https://site.test/watch/video/clip.mp4']);
    });

    it('honours <base href> when resolving relative links', () => {
        expect(extractMediaUrls('<base href="https://cdn.test/files/"><source src="clip.mp4">', PAGE)).toEqual(['https://cdn.test/files/clip.mp4']);
    });

    it('finds players configured with file/source keys', () => {
        expect(extractMediaUrls(`jwplayer().setup({ file: 'episodes/one.m3u8' }); var x = { source: "two.mpd" };`, PAGE)).toEqual([
            'https://site.test/watch/episodes/one.m3u8',
            'https://site.test/watch/two.mpd'
        ]);
    });

    it('reads og:video and twitter:player:stream meta tags that point to media', () => {
        const html = `
            <meta property="og:video" content="https://cdn.test/og.mp4">
            <meta content="https://cdn.test/secure.webm" property="og:video:secure_url">
            <meta name="twitter:player:stream" content="https://cdn.test/tw.m3u8">`;
        expect(extractMediaUrls(html, PAGE)).toEqual(['https://cdn.test/og.mp4', 'https://cdn.test/secure.webm', 'https://cdn.test/tw.m3u8']);
    });

    it('removes duplicates, unknown types and non-http links', () => {
        const html = `
            <video src="https://cdn.test/a.mp4"></video>
            <a href="https://cdn.test/a.mp4">again</a>
            <meta property="og:video" content="https://cdn.test/embed/player">
            <source src="data:video/mp4;base64,AAAA">
            <source src="ftp://cdn.test/old.mp4">`;
        expect(extractMediaUrls(html, PAGE)).toEqual(['https://cdn.test/a.mp4']);
    });

    it('returns nothing for a page without media', () => {
        expect(extractMediaUrls('<html><body><h1>Hello</h1></body></html>', PAGE)).toEqual([]);
    });
});

describe('extractEmbeddedPages', () => {
    it('finds iframes, including lazy ones, resolved against the page', () => {
        const html = '<iframe src="/embed/1"></iframe><iframe data-src="https://player.test/v/2" width="1"></iframe>';
        expect(extractEmbeddedPages(html, PAGE)).toEqual(['https://site.test/embed/1', 'https://player.test/v/2']);
    });

    it('includes og:video pages that are not media files', () => {
        expect(extractEmbeddedPages('<meta property="og:video" content="https://player.test/embed/7">', PAGE)).toEqual(['https://player.test/embed/7']);
    });

    it('skips media files, non-http addresses and duplicates', () => {
        const html = `
            <iframe src="https://cdn.test/a.mp4"></iframe>
            <iframe src="javascript:alert(1)"></iframe>
            <iframe src="about:blank"></iframe>
            <iframe src="/embed/1"></iframe><iframe src="/embed/1"></iframe>`;
        expect(extractEmbeddedPages(html, PAGE)).toEqual(['https://site.test/embed/1']);
    });
});

function fakeFetch(pages: Record<string, string | Error>, finalUrls: Record<string, string> = {}) {
    return vi.fn(async (url: string): Promise<PageFetchResult> => {
        const page = pages[url];
        if (page === undefined) {
            throw new Error(`no page for ${url}`);
        }
        if (page instanceof Error) {
            throw page;
        }
        return { html: page, finalUrl: finalUrls[url] ?? url };
    });
}

const signal = new AbortController().signal;

describe('scanPage', () => {
    it('finds media in the page and remembers which page it came from', async () => {
        const fetchPage = fakeFetch({ [PAGE]: '<title>Episode 1</title><video src="/m/clip.mp4"></video>' });
        await expect(scanPage(PAGE, { fetchPage }, signal)).resolves.toEqual({
            candidates: [{ url: 'https://site.test/m/clip.mp4', kind: 'mp4', referer: PAGE }],
            title: 'Episode 1',
            pagesScanned: 1,
            error: null
        });
        expect(fetchPage).toHaveBeenCalledWith(PAGE, signal);
    });

    it('follows iframes and uses the iframe address as the referer of what it finds', async () => {
        const fetchPage = fakeFetch({
            [PAGE]: '<title>Root</title><iframe src="https://player.test/embed/1"></iframe>',
            'https://player.test/embed/1': '<title>Player</title><script>start("https://cdn.test/v/master.m3u8")</script>'
        });
        const result = await scanPage(PAGE, { fetchPage }, signal);
        expect(result.candidates).toEqual([{ url: 'https://cdn.test/v/master.m3u8', kind: 'hls', referer: 'https://player.test/embed/1' }]);
        expect(result.title).toBe('Root');
        expect(result.pagesScanned).toBe(2);
    });

    it('uses the final address after redirects to resolve and as referer', async () => {
        const fetchPage = fakeFetch({ [PAGE]: '<source src="clip.mp4">' }, { [PAGE]: 'https://other.test/dir/page' });
        const result = await scanPage(PAGE, { fetchPage }, signal);
        expect(result.candidates).toEqual([{ url: 'https://other.test/dir/clip.mp4', kind: 'mp4', referer: 'https://other.test/dir/page' }]);
    });

    it(`does not go deeper than ${MAX_IFRAME_DEPTH} levels of iframes`, async () => {
        const fetchPage = fakeFetch({
            [PAGE]: '<iframe src="https://l1.test/"></iframe>',
            'https://l1.test/': '<iframe src="https://l2.test/"></iframe>',
            'https://l2.test/': '<iframe src="https://l3.test/"></iframe>',
            'https://l3.test/': '<video src="https://cdn.test/too-deep.mp4"></video>'
        });
        const result = await scanPage(PAGE, { fetchPage }, signal);
        expect(result.candidates).toEqual([]);
        expect(fetchPage).not.toHaveBeenCalledWith('https://l3.test/', signal);
        expect(result.pagesScanned).toBe(3);
    });

    it(`scans at most ${MAX_PAGES} pages`, async () => {
        const iframes = Array.from({ length: 12 }, (_unused, index) => {
            return `<iframe src="https://p${index}.test/"></iframe>`;
        }).join('');
        const pages: Record<string, string> = { [PAGE]: iframes };
        for (let index = 0; index < 12; index += 1) {
            pages[`https://p${index}.test/`] = '<p>empty</p>';
        }
        const fetchPage = fakeFetch(pages);
        const result = await scanPage(PAGE, { fetchPage }, signal);
        expect(result.pagesScanned).toBe(MAX_PAGES);
        expect(fetchPage).toHaveBeenCalledTimes(MAX_PAGES);
    });

    it('never scans the same page twice', async () => {
        const fetchPage = fakeFetch({
            [PAGE]: '<iframe src="https://p.test/"></iframe><iframe src="https://p.test/"></iframe>',
            'https://p.test/': `<iframe src="${PAGE}"></iframe>`
        });
        await scanPage(PAGE, { fetchPage }, signal);
        expect(fetchPage).toHaveBeenCalledTimes(2);
    });

    it('ignores iframes that fail to load and keeps what the other pages gave', async () => {
        const fetchPage = fakeFetch({
            [PAGE]: '<video src="https://cdn.test/ok.mp4"></video><iframe src="https://bad.test/"></iframe>',
            'https://bad.test/': new Error('HTTP 500')
        });
        const result = await scanPage(PAGE, { fetchPage }, signal);
        expect(result.candidates.map((candidate) => {
            return candidate.url;
        })).toEqual(['https://cdn.test/ok.mp4']);
        expect(result.error).toBeNull();
    });

    it('reports an error when the page itself cannot be loaded', async () => {
        const fetchPage = fakeFetch({ [PAGE]: new Error('The page answered with HTTP 404.') });
        await expect(scanPage(PAGE, { fetchPage }, signal)).resolves.toEqual({ candidates: [], title: null, pagesScanned: 0, error: 'The page answered with HTTP 404.' });
    });

    it('uses a generic message when the failure is not an Error', async () => {
        const fetchPage = vi.fn(async () => {
            throw 'boom';
        });
        expect((await scanPage(PAGE, { fetchPage }, signal)).error).toBe('The page could not be loaded.');
    });

    it('keeps the title of the root page only', async () => {
        const fetchPage = fakeFetch({ [PAGE]: '<iframe src="https://p.test/"></iframe>', 'https://p.test/': '<title>Inner</title>' });
        expect((await scanPage(PAGE, { fetchPage }, signal)).title).toBeNull();
    });

    it('does not collect the same address twice', async () => {
        const fetchPage = fakeFetch({
            [PAGE]: '<video src="https://cdn.test/a.mp4"></video><iframe src="https://p.test/"></iframe>',
            'https://p.test/': '<video src="https://cdn.test/a.mp4"></video>'
        });
        expect((await scanPage(PAGE, { fetchPage }, signal)).candidates).toHaveLength(1);
    });

    it(`keeps at most ${MAX_CANDIDATES} candidates`, async () => {
        const many = Array.from({ length: MAX_CANDIDATES + 10 }, (_unused, index) => {
            return `<source src="https://cdn.test/v${index}.mp4">`;
        }).join('');
        const result = await scanPage(PAGE, { fetchPage: fakeFetch({ [PAGE]: many }) }, signal);
        expect(result.candidates).toHaveLength(MAX_CANDIDATES);
    });

    it('stops when the search is cancelled', async () => {
        const controller = new AbortController();
        const fetchPage = vi.fn(async () => {
            controller.abort();
            return { html: '<iframe src="https://p.test/"></iframe>', finalUrl: PAGE };
        });
        const result = await scanPage(PAGE, { fetchPage }, controller.signal);
        expect(fetchPage).toHaveBeenCalledTimes(1);
        expect(result.pagesScanned).toBe(1);
    });

    describe('private network protection', () => {
        it('does not follow iframes that point into the local network from a public page', async () => {
            const fetchPage = fakeFetch({ [PAGE]: '<iframe src="http://192.168.0.1/admin"></iframe><iframe src="http://localhost:8080/"></iframe>' });
            await scanPage(PAGE, { fetchPage }, signal);
            expect(fetchPage).toHaveBeenCalledTimes(1);
        });

        it('does not offer media that lives on the local network when the page is public', async () => {
            const fetchPage = fakeFetch({ [PAGE]: '<video src="http://127.0.0.1:9000/a.mp4"></video><video src="https://cdn.test/b.mp4"></video>' });
            const result = await scanPage(PAGE, { fetchPage }, signal);
            expect(result.candidates.map((candidate) => {
                return candidate.url;
            })).toEqual(['https://cdn.test/b.mp4']);
        });

        it('allows the local network when the page itself is local', async () => {
            const local = 'http://127.0.0.1:8080/page.html';
            const fetchPage = fakeFetch({ [local]: '<video src="/clip.mp4"></video><iframe src="/inner.html"></iframe>', 'http://127.0.0.1:8080/inner.html': '<source src="/inner.m3u8">' });
            const result = await scanPage(local, { fetchPage }, signal);
            expect(result.candidates.map((candidate) => {
                return candidate.url;
            })).toEqual(['http://127.0.0.1:8080/clip.mp4', 'http://127.0.0.1:8080/inner.m3u8']);
        });
    });
});

describe('defaultFetchPage', () => {
    function stubFetch(response: Response) {
        const fetchMock = vi.fn(async () => {
            return response;
        });
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    it('downloads the page with browser-like headers and follows redirects', async () => {
        const fetchMock = stubFetch(new Response('<html>ok</html>', { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
        await expect(defaultFetchPage(PAGE, signal)).resolves.toEqual({ html: '<html>ok</html>', finalUrl: PAGE });
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(PAGE);
        expect(init.redirect).toBe('follow');
        expect(init.headers).toEqual({ 'User-Agent': STREAM_USER_AGENT, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' });
    });

    it('refuses addresses that are not http(s) without touching the network', async () => {
        const fetchMock = stubFetch(new Response('x'));
        await expect(defaultFetchPage('file:///etc/passwd', signal)).rejects.toThrow('Only http(s) pages can be scanned.');
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails with the HTTP status', async () => {
        stubFetch(new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } }));
        await expect(defaultFetchPage(PAGE, signal)).rejects.toThrow('The page answered with HTTP 404.');
    });

    it('refuses content that is not a web page', async () => {
        stubFetch(new Response('PK', { status: 200, headers: { 'content-type': 'application/zip' } }));
        await expect(defaultFetchPage(PAGE, signal)).rejects.toThrow('The address is not a web page.');
    });

    it('refuses pages whose declared size is too large', async () => {
        stubFetch(new Response('x', { status: 200, headers: { 'content-type': 'text/html', 'content-length': String(MAX_PAGE_BYTES + 1) } }));
        await expect(defaultFetchPage(PAGE, signal)).rejects.toThrow('The page is too large to scan.');
    });

    it('truncates bodies that exceed the limit without a declared size', async () => {
        stubFetch(new Response('a'.repeat(MAX_PAGE_BYTES + 100), { status: 200, headers: { 'content-type': 'text/html' } }));
        expect((await defaultFetchPage(PAGE, signal)).html).toHaveLength(MAX_PAGE_BYTES);
    });
});
