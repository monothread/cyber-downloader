import {
    hostOf,
    isHttpUrl,
    isPrivateHost,
    isSegmentUrl,
    kindFromContentType,
    kindFromUrl,
    STREAM_KIND_ORDER
} from '@main/services/mediaKinds';

describe('kindFromUrl', () => {
    it.each([
        ['https://a.com/v/master.m3u8', 'hls'],
        ['https://a.com/v/master.m3u8?token=1&x=2', 'hls'],
        ['https://a.com/v/manifest.mpd', 'dash'],
        ['https://a.com/clip.mp4', 'mp4'],
        ['https://a.com/clip.M4V', 'mp4'],
        ['https://a.com/clip.mov', 'mp4'],
        ['https://a.com/clip.webm#t=3', 'webm']
    ])('recognises %s as %s', (url, kind) => {
        expect(kindFromUrl(url)).toBe(kind);
    });

    it.each(['https://a.com/page.html', 'https://a.com/clip.mp4.jpg', 'https://a.com/stream', 'not a url', ''])('returns null for %s', (url) => {
        expect(kindFromUrl(url)).toBeNull();
    });
});

describe('isSegmentUrl', () => {
    it.each(['https://a.com/s/seg1.ts', 'https://a.com/s/chunk.m4s', 'https://a.com/k.key', 'https://a.com/a.aac', 'https://a.com/s.vtt'])('flags %s', (url) => {
        expect(isSegmentUrl(url)).toBe(true);
    });

    it.each(['https://a.com/master.m3u8', 'https://a.com/clip.mp4', 'https://a.com/stream', 'nope'])('does not flag %s', (url) => {
        expect(isSegmentUrl(url)).toBe(false);
    });
});

describe('kindFromContentType', () => {
    it.each([
        ['application/vnd.apple.mpegurl', 'hls'],
        ['application/x-mpegURL', 'hls'],
        ['audio/mpegurl', 'hls'],
        ['application/dash+xml', 'dash'],
        ['video/mp4', 'mp4'],
        ['video/mp4; codecs="avc1"', 'mp4'],
        ['video/webm', 'webm'],
        ['video/x-matroska', 'other'],
        ['video/quicktime', 'other']
    ])('maps %s to %s', (contentType, kind) => {
        expect(kindFromContentType(contentType)).toBe(kind);
    });

    it.each(['video/mp2t', 'video/iso.segment', 'text/html', 'application/json', 'image/png', '', null, undefined])('returns null for %s', (contentType) => {
        expect(kindFromContentType(contentType)).toBeNull();
    });
});

describe('isHttpUrl and hostOf', () => {
    it('accepts only http and https', () => {
        expect(isHttpUrl('http://a.com')).toBe(true);
        expect(isHttpUrl('https://a.com/x')).toBe(true);
        expect(isHttpUrl('ftp://a.com')).toBe(false);
        expect(isHttpUrl('javascript:alert(1)')).toBe(false);
        expect(isHttpUrl('data:text/html,hi')).toBe(false);
        expect(isHttpUrl('nope')).toBe(false);
    });

    it('extracts the host name', () => {
        expect(hostOf('https://cdn.example.com:8443/a/b.m3u8')).toBe('cdn.example.com');
        expect(hostOf('nope')).toBe('');
    });
});

describe('isPrivateHost', () => {
    it.each([
        'localhost',
        'app.localhost',
        'printer.local',
        '127.0.0.1',
        '127.1.2.3',
        '10.0.0.5',
        '172.16.0.1',
        '172.31.255.255',
        '192.168.1.1',
        '169.254.10.10',
        '0.0.0.0',
        '::1',
        '[::1]',
        'fc00::1',
        'fd12:3456::1',
        'fe80::1'
    ])('treats %s as private', (host) => {
        expect(isPrivateHost(host)).toBe(true);
    });

    it.each(['example.com', 'cdn.example.com', '8.8.8.8', '172.15.0.1', '172.32.0.1', '192.169.0.1', '11.0.0.1', 'fcbarcelona.com', 'fd.example.org', '1.2.3', '999.1.1.1'])('treats %s as public', (host) => {
        expect(isPrivateHost(host)).toBe(false);
    });
});

describe('STREAM_KIND_ORDER', () => {
    it('ranks playlists before plain files', () => {
        expect(STREAM_KIND_ORDER).toEqual(['hls', 'dash', 'mp4', 'webm', 'other']);
    });
});
