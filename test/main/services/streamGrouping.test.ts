import { IDENTITY_PARAMETERS, MIN_SHARED_PARAMETERS, SIMILARITY_THRESHOLD, groupSimilarStreams } from '@main/services/streamGrouping';

// Anonymised model of a signed, temporary address that a player asks for and that the host then redirects to
// another server, appending session parameters each time. Nothing here comes from a real site or user.
const BASE = {
    expire: '1999999999',
    ei: 'EXAMPLEei',
    ip: '2001:db8::1',
    id: 'abc123def456',
    itag: '18',
    source: 'host',
    requiressl: 'yes',
    susc: 'h1',
    mime: 'video/mp4',
    sparams: 'expire,ei,ip,id,itag,source,requiressl,susc,mime',
    sig: 'SignatureOne',
    cpn: 'sessionToken',
    c: 'EMBEDDED_PLAYER'
};

function address(host: string, extra: Record<string, string>, base: Record<string, string> = BASE): string {
    const query = new URLSearchParams({ ...base, ...extra });
    return `https://${host}/videoplayback?${query.toString()}`;
}

const FIRST = address('rr4---sn-aaaa.cdn.test', { met: '100', mh: 'KV', mm: '31', mn: 'sn-aaaa', ms: 'au', mv: 'm', mvi: '4', pl: '41', dur: '1420.155', lmt: '555', lsig: 'first' });
const REDIRECT = address('r2---sn-bbbb.cdn.test', { cms_redirect: 'yes', met: '103', mh: 'KV', mm: '26', mn: 'sn-bbbb', ms: 'onr', mv: 'm', mvi: '2', pl: '41', lsig: 'second' });
const REDIRECT_AGAIN = address('r2---sn-bbbb.cdn.test', { cms_redirect: 'yes', met: '104', mh: 'KV', mm: '26', mn: 'sn-bbbb', ms: 'onr', mv: 'm', mvi: '2', pl: '41', lsig: 'third' });

function stream(url: string, kind: 'hls' | 'dash' | 'mp4' | 'webm' | 'other' = 'mp4') {
    return { url, kind };
}

describe('groupSimilarStreams', () => {
    it('exposes its thresholds', () => {
        expect(MIN_SHARED_PARAMETERS).toBe(4);
        expect(SIMILARITY_THRESHOLD).toBe(0.6);
        expect(Array.from(IDENTITY_PARAMETERS)).toEqual(['id', 'sig', 'signature', 'token', 'hash', 'key', 'v', 'vid', 'video', 'video_id', 'videoid', 'file', 'fid', 'itag', 'format', 'quality']);
    });

    it('folds the same video served from several servers into the first address seen', () => {
        const groups = groupSimilarStreams([stream(FIRST), stream(REDIRECT), stream(REDIRECT_AGAIN)]);
        expect(groups).toEqual([{ stream: stream(FIRST), duplicates: 2 }]);
    });

    it('keeps the earliest address as the representative whatever its position', () => {
        expect(groupSimilarStreams([stream(REDIRECT), stream(FIRST)])).toEqual([{ stream: stream(REDIRECT), duplicates: 1 }]);
    });

    it('folds the two redirect variants together even without the original', () => {
        expect(groupSimilarStreams([stream(REDIRECT), stream(REDIRECT_AGAIN)])).toEqual([{ stream: stream(REDIRECT), duplicates: 1 }]);
    });

    it('keeps different videos from the same host apart', () => {
        const other = address('rr4---sn-aaaa.cdn.test', { id: 'zzz999', sig: 'SignatureTwo', met: '100', mh: 'KV', mm: '31' });
        const groups = groupSimilarStreams([stream(FIRST), stream(other)]);
        expect(groups.map((group) => {
            return group.stream.url;
        })).toEqual([FIRST, other]);
        expect(groups.map((group) => {
            return group.duplicates;
        })).toEqual([0, 0]);
    });

    it('keeps the same address in another quality apart when enough parameters differ', () => {
        const hd = address('rr4---sn-aaaa.cdn.test', { itag: '22', sig: 'HdSignature', expire: '2000000000', ei: 'OtherEi', ip: '2001:db8::2', cpn: 'otherSession', sparams: 'other', mime: 'video/webm', met: '1', mh: 'KV' });
        expect(groupSimilarStreams([stream(FIRST), stream(hd)])).toHaveLength(2);
    });

    it('never merges different kinds', () => {
        const groups = groupSimilarStreams([stream(FIRST, 'mp4'), stream(REDIRECT, 'other')]);
        expect(groups).toHaveLength(2);
    });

    it('never merges different paths', () => {
        const other = FIRST.replace('/videoplayback', '/otherplayback');
        expect(groupSimilarStreams([stream(FIRST), stream(other)])).toHaveLength(2);
    });

    it('does not merge addresses that share too few parameters', () => {
        const small = (host: string) => {
            return `https://${host}/video.mp4?token=abc&quality=hd&lang=en`;
        };
        expect(groupSimilarStreams([stream(small('a.cdn.test')), stream(small('b.cdn.test'))])).toHaveLength(2);
    });

    it('merges addresses right at the minimum shared parameters when they are all of the shorter one', () => {
        const left = 'https://a.cdn.test/v.mp4?a=1&b=2&c=3&d=4&x=left';
        const right = 'https://b.cdn.test/v.mp4?a=1&b=2&c=3&d=4&y=right&z=also';
        expect(groupSimilarStreams([stream(left), stream(right)])).toEqual([{ stream: stream(left), duplicates: 1 }]);
    });

    it('does not merge when the shared parameters are a small part of the shorter address', () => {
        const left = 'https://a.cdn.test/v.mp4?a=1&b=2&c=3&d=4&e=5&f=6&g=7&h=8';
        const right = 'https://b.cdn.test/v.mp4?a=1&b=2&c=3&d=4&e=x&f=x&g=x&h=x';
        expect(groupSimilarStreams([stream(left), stream(right)])).toHaveLength(2);
    });

    it('does not merge mirrors without query parameters on different hosts', () => {
        const groups = groupSimilarStreams([stream('https://a.cdn.test/clip.mp4'), stream('https://b.cdn.test/clip.mp4')]);
        expect(groups).toHaveLength(2);
    });

    it('treats an identical address as the same stream', () => {
        expect(groupSimilarStreams([stream('https://a.cdn.test/clip.mp4'), stream('https://a.cdn.test/clip.mp4')])).toEqual([
            { stream: stream('https://a.cdn.test/clip.mp4'), duplicates: 1 }
        ]);
    });

    it('compares a stream with every member of a group, not only the first', () => {
        const a = 'https://a.cdn.test/v.mp4?p1=1&p2=2&p3=3&p4=4&p5=5';
        const b = 'https://b.cdn.test/v.mp4?p1=1&p2=2&p3=3&p4=4&p6=6&p7=7&p8=8';
        const c = 'https://c.cdn.test/v.mp4?p4=4&p6=6&p7=7&p8=8&p9=9';
        // c shares only one parameter with a, but four of its five with b (which is in a's group).
        expect(groupSimilarStreams([stream(a), stream(b), stream(c)])).toEqual([{ stream: stream(a), duplicates: 2 }]);
    });

    it('keeps the order of the distinct streams', () => {
        const other = 'https://x.cdn.test/other.m3u8';
        const groups = groupSimilarStreams([stream(FIRST), stream(other, 'hls'), stream(REDIRECT)]);
        expect(groups.map((group) => {
            return group.stream.url;
        })).toEqual([FIRST, other]);
        expect(groups[0]?.duplicates).toBe(1);
    });

    it('keeps the extra properties of the streams', () => {
        const rich = { url: FIRST, kind: 'mp4' as const, referer: 'https://page.test/', cookie: null };
        expect(groupSimilarStreams([rich])[0]?.stream).toBe(rich);
    });

    it('handles an empty list and addresses that are not valid URLs', () => {
        expect(groupSimilarStreams([])).toEqual([]);
        expect(groupSimilarStreams([stream('not a url'), stream('also not a url'), stream('not a url')])).toEqual([
            { stream: stream('not a url'), duplicates: 1 },
            { stream: stream('also not a url'), duplicates: 0 }
        ]);
    });

    describe('identity parameters', () => {
        const shared = 'r1=1&r2=2&r3=3&r4=4&r5=5&r6=6';

        it.each(['id', 'sig', 'signature', 'token', 'itag', 'quality', 'v'])('does not merge addresses whose "%s" differs, even with many shared parameters', (name) => {
            const left = `https://a.cdn.test/v.mp4?${shared}&${name}=one`;
            const right = `https://b.cdn.test/v.mp4?${shared}&${name}=two`;
            expect(groupSimilarStreams([stream(left), stream(right)])).toHaveLength(2);
        });

        it('merges the same addresses when the identity parameter is equal', () => {
            const left = `https://a.cdn.test/v.mp4?${shared}&id=same&extra=1`;
            const right = `https://b.cdn.test/v.mp4?${shared}&id=same&extra=2`;
            expect(groupSimilarStreams([stream(left), stream(right)])).toEqual([{ stream: stream(left), duplicates: 1 }]);
        });

        it('ignores an identity parameter that only one of the addresses has', () => {
            const left = `https://a.cdn.test/v.mp4?${shared}&id=abc`;
            const right = `https://b.cdn.test/v.mp4?${shared}`;
            expect(groupSimilarStreams([stream(left), stream(right)])).toHaveLength(1);
        });
    });
});

