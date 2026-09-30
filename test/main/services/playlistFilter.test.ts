import {
    MAX_PLAYLIST_BYTES,
    defaultFetchPlaylist,
    dropVariantPlaylists,
    variantUrlsOf
} from '@main/services/playlistFilter';
import { STREAM_USER_AGENT } from '@main/services/pageScanner';

afterEach(() => {
    vi.unstubAllGlobals();
});

const MASTER_URL = 'https://cdn.test/v/master.m3u8';
const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
low/index.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720

https://other.test/high.m3u8?token=1
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio/en.m3u8"
#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,URI="iframes.m3u8"
`;
const MEDIA = `#EXTM3U
#EXT-X-TARGETDURATION:6
#EXTINF:6.0,
seg1.ts
#EXT-X-ENDLIST
`;

describe('variantUrlsOf', () => {
    it('lists the variants, audio renditions and i-frame playlists of a master playlist, resolved against it', () => {
        expect(variantUrlsOf(MASTER, MASTER_URL)).toEqual([
            'https://cdn.test/v/low/index.m3u8',
            'https://other.test/high.m3u8?token=1',
            'https://cdn.test/v/audio/en.m3u8',
            'https://cdn.test/v/iframes.m3u8'
        ]);
    });

    it('returns nothing for a media playlist', () => {
        expect(variantUrlsOf(MEDIA, MASTER_URL)).toEqual([]);
    });

    it('returns nothing for unrelated text', () => {
        expect(variantUrlsOf('<html>not a playlist</html>', MASTER_URL)).toEqual([]);
        expect(variantUrlsOf('', MASTER_URL)).toEqual([]);
    });

    it('ignores a stream-inf line with nothing after it and non-http references', () => {
        const body = '#EXT-X-STREAM-INF:BANDWIDTH=1\n#EXT-X-MEDIA:URI="javascript:alert(1)"\n#EXT-X-MEDIA:TYPE=AUDIO\n';
        expect(variantUrlsOf(body, MASTER_URL)).toEqual([]);
    });

    it('handles Windows line endings', () => {
        expect(variantUrlsOf('#EXT-X-STREAM-INF:BANDWIDTH=1\r\nlow.m3u8\r\n', MASTER_URL)).toEqual(['https://cdn.test/v/low.m3u8']);
    });
});

describe('dropVariantPlaylists', () => {
    const master = { url: MASTER_URL, kind: 'hls' as const, referer: 'https://site.test/' };
    const low = { url: 'https://cdn.test/v/low/index.m3u8', kind: 'hls' as const, referer: 'https://site.test/' };
    const other = { url: 'https://cdn.test/v/standalone.m3u8', kind: 'hls' as const, referer: 'https://site.test/' };
    const file = { url: 'https://cdn.test/clip.mp4', kind: 'mp4' as const, referer: 'https://site.test/' };

    function fetchFrom(bodies: Record<string, string | Error>) {
        return vi.fn(async (url: string) => {
            const body = bodies[url];
            if (body instanceof Error || body === undefined) {
                throw body ?? new Error('unknown');
            }
            return body;
        });
    }

    it('keeps only the master when its variants were found too', async () => {
        const fetchPlaylist = fetchFrom({ [master.url]: MASTER, [low.url]: MEDIA });
        await expect(dropVariantPlaylists([master, low], fetchPlaylist)).resolves.toEqual([master]);
    });

    it('does not depend on the order of the list', async () => {
        const fetchPlaylist = fetchFrom({ [master.url]: MASTER, [low.url]: MEDIA });
        await expect(dropVariantPlaylists([low, master], fetchPlaylist)).resolves.toEqual([master]);
    });

    it('keeps playlists that no master refers to and non-HLS streams', async () => {
        const fetchPlaylist = fetchFrom({ [master.url]: MASTER, [other.url]: MEDIA, [low.url]: MEDIA });
        await expect(dropVariantPlaylists([master, low, other, file], fetchPlaylist)).resolves.toEqual([master, other, file]);
    });

    it('asks for each HLS playlist with its own referer and never for other kinds', async () => {
        const fetchPlaylist = fetchFrom({ [master.url]: MASTER, [low.url]: MEDIA });
        await dropVariantPlaylists([master, low, file], fetchPlaylist);
        expect(fetchPlaylist.mock.calls).toEqual([
            [master.url, 'https://site.test/'],
            [low.url, 'https://site.test/']
        ]);
    });

    it('keeps everything when a playlist cannot be read', async () => {
        const fetchPlaylist = fetchFrom({ [master.url]: new Error('HTTP 403'), [low.url]: MEDIA });
        await expect(dropVariantPlaylists([master, low], fetchPlaylist)).resolves.toEqual([master, low]);
    });

    it('returns an empty list unchanged', async () => {
        await expect(dropVariantPlaylists([], fetchFrom({}))).resolves.toEqual([]);
    });
});

describe('defaultFetchPlaylist', () => {
    it('downloads the playlist with the page as referer and a browser user agent', async () => {
        const fetchMock = vi.fn(async () => {
            return new Response(MASTER, { status: 200 });
        });
        vi.stubGlobal('fetch', fetchMock);
        await expect(defaultFetchPlaylist(MASTER_URL, 'https://site.test/')).resolves.toBe(MASTER);
        const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe(MASTER_URL);
        expect(init.headers).toEqual({ 'User-Agent': STREAM_USER_AGENT, Referer: 'https://site.test/' });
        expect(init.redirect).toBe('follow');
    });

    it('fails on an error status', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            return new Response('no', { status: 403 });
        }));
        await expect(defaultFetchPlaylist(MASTER_URL, 'https://site.test/')).rejects.toThrow('HTTP 403');
    });

    it('cuts very large bodies', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => {
            return new Response('a'.repeat(MAX_PLAYLIST_BYTES + 50), { status: 200 });
        }));
        expect(await defaultFetchPlaylist(MASTER_URL, 'https://site.test/')).toHaveLength(MAX_PLAYLIST_BYTES);
    });
});
