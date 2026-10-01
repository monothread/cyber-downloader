import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    ANIME_MEDIA_SCHEME,
    contentTypeOf,
    createMediaHandler,
    defaultMediaFileSystem,
    parseMediaUrl,
    parseRange,
    type ByteRange,
    type MediaFileSystem
} from '@main/services/mediaProtocol';
import { cleanTempDirs, makeTempDir } from '../../helpers/tempDir';

afterEach(() => {
    cleanTempDirs();
});

function streamOf(text: string): ReadableStream<Uint8Array> {
    return new Response(text).body as ReadableStream<Uint8Array>;
}

describe('parseRange', () => {
    it('answers null when no range was asked', () => {
        expect(parseRange(null, 100)).toBeNull();
    });

    it('reads a closed range', () => {
        expect(parseRange('bytes=10-19', 100)).toEqual({ start: 10, end: 19 });
    });

    it('reads an open-ended range up to the last byte', () => {
        expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
        expect(parseRange('bytes=0-', 100)).toEqual({ start: 0, end: 99 });
    });

    it('cuts the end of a range that goes past the file', () => {
        expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 });
    });

    it('reads a suffix range as the last bytes', () => {
        expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
        expect(parseRange('bytes=-500', 100)).toEqual({ start: 0, end: 99 });
    });

    it('trims the header', () => {
        expect(parseRange('  bytes=0-9 ', 100)).toEqual({ start: 0, end: 9 });
    });

    it('rejects what cannot be satisfied', () => {
        expect(parseRange('bytes=100-', 100)).toBe('invalid');
        expect(parseRange('bytes=50-10', 100)).toBe('invalid');
        expect(parseRange('bytes=-0', 100)).toBe('invalid');
        expect(parseRange('bytes=-', 100)).toBe('invalid');
        expect(parseRange('bytes=0-10', 0)).toBe('invalid');
    });

    it('rejects what is not a single byte range', () => {
        expect(parseRange('bytes=0-1,5-6', 100)).toBe('invalid');
        expect(parseRange('items=0-1', 100)).toBe('invalid');
        expect(parseRange('', 100)).toBe('invalid');
        expect(parseRange('bytes=a-b', 100)).toBe('invalid');
    });
});

describe('contentTypeOf', () => {
    it('knows the video and subtitle types', () => {
        expect(contentTypeOf('/a/b.mp4')).toBe('video/mp4');
        expect(contentTypeOf('/a/b.M4V')).toBe('video/mp4');
        expect(contentTypeOf('/a/b.webm')).toBe('video/webm');
        expect(contentTypeOf('/a/b.mkv')).toBe('video/x-matroska');
        expect(contentTypeOf('/a/b.vtt')).toBe('text/vtt; charset=utf-8');
    });

    it('falls back to a generic type', () => {
        expect(contentTypeOf('/a/b.xyz')).toBe('application/octet-stream');
        expect(contentTypeOf('/a/b')).toBe('application/octet-stream');
    });
});

describe('parseMediaUrl', () => {
    it('reads the kind and the episode id', () => {
        expect(ANIME_MEDIA_SCHEME).toBe('pullwave-media');
        expect(parseMediaUrl('pullwave-media://episode/12')).toEqual({ kind: 'episode', episodeId: 12 });
        expect(parseMediaUrl('pullwave-media://subtitle/7')).toEqual({ kind: 'subtitle', episodeId: 7 });
    });

    it('rejects anything else', () => {
        expect(parseMediaUrl('not a url')).toBeNull();
        expect(parseMediaUrl('https://episode/12')).toBeNull();
        expect(parseMediaUrl('pullwave-media://other/12')).toBeNull();
        expect(parseMediaUrl('pullwave-media://episode/')).toBeNull();
        expect(parseMediaUrl('pullwave-media://episode/abc')).toBeNull();
        expect(parseMediaUrl('pullwave-media://episode/12/extra')).toBeNull();
        expect(parseMediaUrl('pullwave-media://episode/../etc/passwd')).toBeNull();
        expect(parseMediaUrl('pullwave-media://episode/-1')).toBeNull();
    });
});

describe('createMediaHandler', () => {
    const CONTENT = '0123456789';

    function setup(options: { path?: string | null; size?: number | null } = {}) {
        const resolve = vi.fn((): string | null => {
            return options.path === undefined ? '/lib/Naruto Episode 1.mp4' : options.path;
        });
        const read = vi.fn((_path: string, range: ByteRange): ReadableStream<Uint8Array> => {
            return streamOf(CONTENT.slice(range.start, range.end + 1));
        });
        const files: MediaFileSystem = {
            size: vi.fn(() => {
                return options.size === undefined ? CONTENT.length : options.size;
            }),
            read
        };
        return { handler: createMediaHandler({ resolve }, files), resolve, read, files };
    }

    function request(url: string, range?: string): Request {
        return new Request(url, range === undefined ? undefined : { headers: { Range: range } });
    }

    it('serves the whole file when no range is asked', async () => {
        const { handler, resolve, read } = setup();
        const response = handler(request('pullwave-media://episode/3'));

        expect(response.status).toBe(200);
        expect(Object.fromEntries(response.headers)).toEqual({
            'accept-ranges': 'bytes',
            'access-control-allow-origin': '*',
            'content-length': '10',
            'content-type': 'video/mp4'
        });
        expect(await response.text()).toBe(CONTENT);
        expect(resolve).toHaveBeenCalledWith('episode', 3);
        expect(read).toHaveBeenCalledWith('/lib/Naruto Episode 1.mp4', { start: 0, end: 9 });
    });

    it('serves the part that was asked for with 206', async () => {
        const { handler, read } = setup();
        const response = handler(request('pullwave-media://episode/3', 'bytes=2-5'));

        expect(response.status).toBe(206);
        expect(Object.fromEntries(response.headers)).toEqual({
            'accept-ranges': 'bytes',
            'access-control-allow-origin': '*',
            'content-length': '4',
            'content-range': 'bytes 2-5/10',
            'content-type': 'video/mp4'
        });
        expect(await response.text()).toBe('2345');
        expect(read).toHaveBeenCalledWith('/lib/Naruto Episode 1.mp4', { start: 2, end: 5 });
    });

    it('serves the end of the file for an open-ended range', async () => {
        const { handler } = setup();
        const response = handler(request('pullwave-media://episode/3', 'bytes=7-'));
        expect(response.status).toBe(206);
        expect(response.headers.get('content-range')).toBe('bytes 7-9/10');
        expect(await response.text()).toBe('789');
    });

    it('answers 416 with the size for a range that cannot be satisfied', async () => {
        const { handler, read } = setup();
        const response = handler(request('pullwave-media://episode/3', 'bytes=50-60'));

        expect(response.status).toBe(416);
        expect(Object.fromEntries(response.headers)).toEqual({ 'access-control-allow-origin': '*', 'content-range': 'bytes */10' });
        expect(await response.text()).toBe('');
        expect(read).not.toHaveBeenCalled();
    });

    it('serves an empty file without reading it', async () => {
        const { handler, read } = setup({ size: 0 });
        const response = handler(request('pullwave-media://episode/3'));
        expect(response.status).toBe(200);
        expect(response.headers.get('content-length')).toBe('0');
        expect(await response.text()).toBe('');
        expect(read).not.toHaveBeenCalled();
    });

    it('serves subtitles with their own type', async () => {
        const { handler, resolve } = setup({ path: '/lib/Naruto Episode 1.vtt' });
        const response = handler(request('pullwave-media://subtitle/3'));
        expect(resolve).toHaveBeenCalledWith('subtitle', 3);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('text/vtt; charset=utf-8');
    });

    it('answers 404 when the episode has nothing to serve', () => {
        const { handler, files } = setup({ path: null });
        const response = handler(request('pullwave-media://episode/3'));
        expect(response.status).toBe(404);
        expect(response.headers.get('access-control-allow-origin')).toBe('*');
        expect(files.size).not.toHaveBeenCalled();
    });

    it('answers 404 when the file is gone', () => {
        const { handler, read } = setup({ size: null });
        expect(handler(request('pullwave-media://episode/3')).status).toBe(404);
        expect(read).not.toHaveBeenCalled();
    });

    it('answers 404 to an address it does not understand without looking anything up', () => {
        const { handler, resolve } = setup();
        expect(handler(request('pullwave-media://episode/abc')).status).toBe(404);
        expect(handler(request('pullwave-media://file/%2Fetc%2Fpasswd')).status).toBe(404);
        expect(resolve).not.toHaveBeenCalled();
    });
});

describe('defaultMediaFileSystem', () => {
    it('reports the size of a file and null for what is missing or not a file', () => {
        const dir = makeTempDir();
        writeFileSync(join(dir, 'a.mp4'), '0123456789');
        mkdirSync(join(dir, 'folder'));

        expect(defaultMediaFileSystem.size(join(dir, 'a.mp4'))).toBe(10);
        expect(defaultMediaFileSystem.size(join(dir, 'missing.mp4'))).toBeNull();
        expect(defaultMediaFileSystem.size(join(dir, 'folder'))).toBeNull();
    });

    it('reads the bytes of a range, both ends included', async () => {
        const dir = makeTempDir();
        writeFileSync(join(dir, 'a.mp4'), '0123456789');
        const body = defaultMediaFileSystem.read(join(dir, 'a.mp4'), { start: 3, end: 6 });
        expect(await new Response(body).text()).toBe('3456');
    });

    it('serves a real file through the handler', async () => {
        const dir = makeTempDir();
        writeFileSync(join(dir, 'a.mp4'), '0123456789');
        const handler = createMediaHandler({ resolve: () => { return join(dir, 'a.mp4'); } }, defaultMediaFileSystem);
        const response = handler(new Request('pullwave-media://episode/1', { headers: { Range: 'bytes=4-6' } }));
        expect(response.status).toBe(206);
        expect(await response.text()).toBe('456');
    });
});
