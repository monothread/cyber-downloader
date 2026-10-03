import { patchAniCli } from '@main/services/aniPatches';

const SUBTITLES = [
    '# header',
    'hianime_m3u8() {',
    `    sub_link="$(printf "%s" "$_json" | sed 's|.*"subtitles":\\[||; s|}\\].*||; s|},{|}\\n{|g' | grep -m 1 '"default":true' | sed -nE 's|.*"src":"([^"]*)".*|\\1|p')"`,
    '}'
].join('\n');
const ALL_SUBTITLES = [
    '    # quality variants are relative to the master playlist',
    '    command -v "yt-dlp" >/dev/null && yt-dlp --referer "$refr" "$1" -o x'
].join('\n');
const DEBUG = '        debug) printf "All links:\\n%s\\nSelected link:\\n%s\\nSubtitles:\\n%s\\n" "$links" "$video_link" "$sub_link" ;;';

describe('patchAniCli', () => {
    it('applies both changes when both fit', () => {
        const patched = patchAniCli(`${SUBTITLES}\n${DEBUG}`) as string;
        expect(patched).toContain('pullwave_pick_subtitle "$_json"');
        expect(patched).toContain('Referer:\\n%s\\n');
    });

    it('makes the debug output carry the subtitles the patch kept, and works without that patch', () => {
        const withList = patchAniCli(`${SUBTITLES}\n${ALL_SUBTITLES}\n${DEBUG}`) as string;
        expect(withList).toContain('pullwave_all_subs=');
        expect(withList).toContain('Subtitle list:\\n%s\\n" "$links" "$video_link" "$sub_link" "$refr" "${pullwave_all_subs:-}"');
        expect(patchAniCli(DEBUG)).toContain('"${pullwave_all_subs:-}"');
    });

    it('applies the one that fits when the other does not', () => {
        expect(patchAniCli(SUBTITLES)).toContain('pullwave_pick_subtitle "$_json"');
        expect(patchAniCli(SUBTITLES)).not.toContain('Referer:');
        expect(patchAniCli(DEBUG)).toContain('Referer:\\n%s\\n');
        expect(patchAniCli(DEBUG)).not.toContain('pullwave_pick_subtitle');
    });

    it('saves all the subtitles when that part of the script fits', () => {
        const script = `${SUBTITLES}\n${ALL_SUBTITLES}`;
        const patched = patchAniCli(script) as string;
        expect(patched).toContain('pullwave_save_subtitles "$download_dir/$_name"');
        expect(patched).toContain('pullwave_all_subs=');
        expect(patched).toContain('pullwave_pick_subtitle "$_json"');
        expect(patchAniCli(ALL_SUBTITLES)).toBeNull();
    });

    it('gives null when nothing fits', () => {
        expect(patchAniCli('a different script')).toBeNull();
        expect(patchAniCli('')).toBeNull();
    });
});
