import { MIN_MEDIA_BYTES_WITHOUT_EXTENSION, classifyRequest, classifyResponse } from '@main/services/sniffRules';

describe('classifyRequest', () => {
    it('records HLS and DASH playlists and lets them through so the player keeps going', () => {
        expect(classifyRequest('https://a.com/master.m3u8?t=1', 'media')).toEqual({ cancel: false, kind: 'hls' });
        expect(classifyRequest('https://a.com/manifest.mpd', 'xhr')).toEqual({ cancel: false, kind: 'dash' });
    });

    it('records plain video files and cancels them so they are not downloaded', () => {
        expect(classifyRequest('https://a.com/clip.mp4', 'media')).toEqual({ cancel: true, kind: 'mp4' });
        expect(classifyRequest('https://a.com/clip.webm', 'media')).toEqual({ cancel: true, kind: 'webm' });
    });

    it.each(['https://a.com/s/seg1.ts', 'https://a.com/s/chunk.m4s', 'https://a.com/k.key'])('cancels the stream piece %s without recording it', (url) => {
        expect(classifyRequest(url, 'media')).toEqual({ cancel: true, kind: null });
    });

    it.each(['image', 'font', 'ping'])('cancels %s requests to save bandwidth', (resourceType) => {
        expect(classifyRequest('https://a.com/file.png', resourceType)).toEqual({ cancel: true, kind: null });
    });

    it('does not record image requests even when the address looks like media', () => {
        expect(classifyRequest('https://a.com/poster.mp4', 'image')).toEqual({ cancel: true, kind: null });
    });

    it('ignores unrelated requests', () => {
        expect(classifyRequest('https://a.com/app.js', 'script')).toEqual({ cancel: false, kind: null });
        expect(classifyRequest('https://a.com/page.html', 'mainFrame')).toEqual({ cancel: false, kind: null });
    });

    it('ignores non-http addresses', () => {
        expect(classifyRequest('file:///etc/passwd', 'other')).toEqual({ cancel: false, kind: null });
        expect(classifyRequest('chrome-extension://x/a.mp4', 'media')).toEqual({ cancel: false, kind: null });
    });
});

describe('classifyResponse', () => {
    it('recognises a playlist served from an address without extension', () => {
        expect(classifyResponse('https://a.com/play?id=1', 'application/vnd.apple.mpegurl', 500)).toEqual({ cancel: false, kind: 'hls' });
        expect(classifyResponse('https://a.com/play?id=2', 'application/dash+xml', null)).toEqual({ cancel: false, kind: 'dash' });
    });

    it('records big media served without extension and cancels it', () => {
        expect(classifyResponse('https://a.com/stream/9', 'video/mp4', MIN_MEDIA_BYTES_WITHOUT_EXTENSION)).toEqual({ cancel: true, kind: 'mp4' });
        expect(classifyResponse('https://a.com/stream/9', 'video/webm', null)).toEqual({ cancel: true, kind: 'webm' });
        expect(classifyResponse('https://a.com/stream/9', 'video/x-matroska', 5_000_000)).toEqual({ cancel: true, kind: 'other' });
    });

    it('ignores tiny media served without extension (trackers, previews)', () => {
        expect(classifyResponse('https://a.com/stream/9', 'video/mp4', MIN_MEDIA_BYTES_WITHOUT_EXTENSION - 1)).toEqual({ cancel: false, kind: null });
    });

    it('accepts small media when the address itself says it is a video', () => {
        expect(classifyResponse('https://a.com/short.mp4', 'video/mp4', 10)).toEqual({ cancel: true, kind: 'mp4' });
    });

    it('ignores stream pieces, non-media and non-http responses', () => {
        expect(classifyResponse('https://a.com/seg.ts', 'video/mp2t', 9_000_000)).toEqual({ cancel: false, kind: null });
        expect(classifyResponse('https://a.com/stream/9', 'video/mp2t', 9_000_000)).toEqual({ cancel: false, kind: null });
        expect(classifyResponse('https://a.com/page', 'text/html', 9_000)).toEqual({ cancel: false, kind: null });
        expect(classifyResponse('https://a.com/page', undefined, null)).toEqual({ cancel: false, kind: null });
        expect(classifyResponse('ftp://a.com/clip', 'video/mp4', 9_000_000)).toEqual({ cancel: false, kind: null });
    });
});
