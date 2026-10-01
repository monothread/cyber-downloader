import { buildStreamArgs, parseStreamOutput, patchDebugReferer } from '@main/services/aniStream';

const ORIGINAL = [
    'case "$player_function" in',
    '        debug) printf "All links:\\n%s\\nSelected link:\\n%s\\nSubtitles:\\n%s\\n" "$links" "$video_link" "$sub_link" ;;',
    '        android_mpv) android_mpv ;;',
    'esac'
].join('\n');

describe('patchDebugReferer', () => {
    it('adds the referer to what the debug player prints', () => {
        const patched = patchDebugReferer(ORIGINAL) as string;
        expect(patched).toContain('debug) printf "All links:\\n%s\\nSelected link:\\n%s\\nSubtitles:\\n%s\\nReferer:\\n%s\\n" "$links" "$video_link" "$sub_link" "$refr" ;;');
        expect(patched).not.toContain('Subtitles:\\n%s\\n" "$links"');
        expect(patched.startsWith('case "$player_function" in\n')).toBe(true);
        expect(patched.endsWith('        android_mpv) android_mpv ;;\nesac')).toBe(true);
    });

    it('gives null for a script it does not know', () => {
        expect(patchDebugReferer('nothing here')).toBeNull();
        expect(patchDebugReferer(ORIGINAL.replace('Subtitles', 'Subs'))).toBeNull();
    });
});

describe('buildStreamArgs', () => {
    it('picks the anime and the episode and the quality, without downloading', () => {
        expect(buildStreamArgs('cyberpunk edgerunners', 2, '5', '720p')).toEqual(['-S', '2', '-e', '5', '-q', '720p', 'cyberpunk edgerunners']);
    });

    it('cleans the query', () => {
        expect(buildStreamArgs('-d naruto &', 1, '1', 'best')).toEqual(['-S', '1', '-e', '1', '-q', 'best', 'd naruto']);
    });
});

describe('parseStreamOutput', () => {
    const LINK = 'https://hls.example.top/v/abc/1080/index.m3u8';

    it('reads the address, the subtitles and the referer', () => {
        const output = [
            'Checking dependencies...',
            'hianime.at links fetched',
            'All links:',
            `1080 >${LINK}`,
            'Selected link:',
            LINK,
            'Subtitles:',
            'https://hls.example.top/v/abc/subs/pt.vtt',
            'Referer:',
            'https://embed.example/'
        ].join('\n');
        expect(parseStreamOutput(output)).toEqual({ url: LINK, subtitleUrl: 'https://hls.example.top/v/abc/subs/pt.vtt', referer: 'https://embed.example/' });
    });

    it('reads a stream without subtitles, which are not printed at all', () => {
        const output = ['All links:', `720 >${LINK}`, 'Selected link:', LINK, 'Subtitles:', 'Referer:', 'https://embed.example/'].join('\n');
        expect(parseStreamOutput(output)).toEqual({ url: LINK, subtitleUrl: null, referer: 'https://embed.example/' });
    });

    it('reads a stream from a script that does not print the referer', () => {
        expect(parseStreamOutput(['Selected link:', LINK, 'Subtitles:', 'https://s/en.vtt'].join('\n'))).toEqual({ url: LINK, subtitleUrl: 'https://s/en.vtt', referer: null });
        expect(parseStreamOutput(['Selected link:', LINK, 'Subtitles:'].join('\n'))).toEqual({ url: LINK, subtitleUrl: null, referer: null });
    });

    it('ignores spaces around the lines and blank lines', () => {
        expect(parseStreamOutput(`  Selected link:  \n\n  ${LINK}  \n`)).toEqual({ url: LINK, subtitleUrl: null, referer: null });
    });

    it('gives null when there is no address', () => {
        expect(parseStreamOutput('')).toBeNull();
        expect(parseStreamOutput('No sources found for sub!')).toBeNull();
        expect(parseStreamOutput('Selected link:')).toBeNull();
        expect(parseStreamOutput('Selected link:\nnot an address')).toBeNull();
        expect(parseStreamOutput(`Selected link:\nftp://x/y`)).toBeNull();
    });

    it('does not take an address that follows a different marker', () => {
        expect(parseStreamOutput(`All links:\n720 >${LINK}\nSubtitles:\nhttps://s/en.vtt`)).toBeNull();
    });
});
