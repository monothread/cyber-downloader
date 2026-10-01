import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ANIME_SUBTITLE_LANGUAGES, ANIME_SUBTITLE_SETTINGS } from '@shared/anime';
import { patchSubtitleSelection, SUBTITLE_LABELS_VARIABLE, SUBTITLE_PICK_FUNCTION, subtitleLabels } from '@main/services/aniSubtitles';
import { cleanTempDirs, makeTempDir } from '../../helpers/tempDir';

const ROOT = join(__dirname, '../../..');
const BUSYBOX = join(ROOT, 'resources', 'bin', 'ani', 'busybox');
const REAL_SCRIPT = join(ROOT, 'resources', 'bin', 'ani', 'ani-cli');
const HAS_TOOLS = existsSync(BUSYBOX) && existsSync(REAL_SCRIPT);

afterEach(() => {
    cleanTempDirs();
});

describe('constants', () => {
    it('lists the subtitle settings', () => {
        expect(ANIME_SUBTITLE_LANGUAGES).toEqual(['English', 'Portuguese', 'Spanish', 'French', 'German', 'Italian', 'Russian']);
        expect(ANIME_SUBTITLE_SETTINGS).toEqual(['auto', 'default', 'English', 'Portuguese', 'Spanish', 'French', 'German', 'Italian', 'Russian']);
        expect(SUBTITLE_LABELS_VARIABLE).toBe('PULLWAVE_SUB_LABELS');
    });
});

describe('subtitleLabels', () => {
    it('leaves ani-cli alone for "default"', () => {
        expect(subtitleLabels('default', 'pt')).toEqual([]);
    });

    it.each([
        ['en', ['English']],
        ['pt', ['Portuguese', 'English']],
        ['es', ['Spanish', 'English']],
        ['zh', ['English']],
        ['ja', ['English']]
    ] as const)('follows the language of the app (%s) for "auto"', (language, labels) => {
        expect(subtitleLabels('auto', language)).toEqual(labels);
    });

    it.each(ANIME_SUBTITLE_LANGUAGES)('takes just %s when it is chosen', (language) => {
        expect(subtitleLabels(language, 'pt')).toEqual([language]);
    });
});

describe('patchSubtitleSelection', () => {
    const original = [
        'something before',
        '',
        'hianime_m3u8() {',
        '    _x=1',
        `    sub_link="$(printf "%s" "$_json" | sed 's|.*"subtitles":\\[||; s|}\\].*||; s|},{|}\\n{|g' | grep -m 1 '"default":true' | sed -nE 's|.*"src":"([^"]*)".*|\\1|p')"`,
        '    links=2',
        '}'
    ].join('\n');

    it('swaps the selection for the function and defines it before the function that uses it', () => {
        const patched = patchSubtitleSelection(original) as string;
        expect(patched).toContain('    sub_link="$(pullwave_pick_subtitle "$_json")"');
        expect(patched).not.toContain("grep -m 1 '\"default\":true' | sed -nE");
        expect(patched.indexOf('pullwave_pick_subtitle() {')).toBeLessThan(patched.indexOf('hianime_m3u8() {'));
        expect(patched).toContain(SUBTITLE_PICK_FUNCTION);
        expect(patched.startsWith('something before\n')).toBe(true);
        expect(patched.endsWith('    links=2\n}')).toBe(true);
    });

    it('gives null when the selection is not the one it knows', () => {
        expect(patchSubtitleSelection(original.replace('"default":true', '"default":false'))).toBeNull();
        expect(patchSubtitleSelection('nothing here')).toBeNull();
    });

    it('gives null when the function it goes before is missing', () => {
        expect(patchSubtitleSelection(original.replace('hianime_m3u8() {', 'other_name() {'))).toBeNull();
    });

    describe.skipIf(!HAS_TOOLS)('with the ani-cli that ships with the app', () => {
        it('patches it and the result is still valid shell', () => {
            const patched = patchSubtitleSelection(readFileSync(REAL_SCRIPT, 'utf-8')) as string;
            expect(patched).not.toBeNull();
            const file = join(makeTempDir(), 'ani-cli');
            writeFileSync(file, patched);
            execFileSync(BUSYBOX, ['sh', '-n', file]);
        });
    });

    describe.skipIf(!HAS_TOOLS)('the function, run by the shell that ships with the app', () => {
        const json = JSON.stringify({
            src: 'https://x/master.m3u8',
            subtitles: [
                { lang: 'en', label: 'English', default: true, src: 'https://s/en.vtt' },
                { lang: 'en', label: 'French', default: false, src: 'https://s/fr.vtt' },
                { lang: 'en', label: 'Portuguese (- Portuguese(Brazil))', default: false, src: 'https://s/pt.vtt' },
                { lang: 'en', label: 'Spanish', default: false, src: 'https://s/es.vtt' }
            ],
            poster: ''
        });
        const noDefault = json.replace('"default":true', '"default":false');

        // The utilities are found through links to busybox, as Pullwave makes them for ani-cli.
        function toolsDirectory(): string {
            const directory = join(makeTempDir(), 'tools');
            mkdirSync(directory);
            ['sed', 'grep'].forEach((name) => {
                symlinkSync(BUSYBOX, join(directory, name));
            });
            return directory;
        }

        function pick(source: string, labels: string): string {
            const directory = makeTempDir();
            const file = join(directory, 'pick.sh');
            writeFileSync(file, `${SUBTITLE_PICK_FUNCTION}\npullwave_pick_subtitle "$JSON"\n`);
            return execFileSync(BUSYBOX, ['sh', file], { env: { JSON: source, [SUBTITLE_LABELS_VARIABLE]: labels, PATH: toolsDirectory() }, encoding: 'utf-8' });
        }

        it('takes the first language that exists, in the order given', () => {
            expect(pick(json, 'Portuguese|English')).toBe('https://s/pt.vtt');
            expect(pick(json, 'Russian|Spanish|English')).toBe('https://s/es.vtt');
        });

        it('ignores the case of the language', () => {
            expect(pick(json, 'portuguese')).toBe('https://s/pt.vtt');
        });

        it('falls back to the subtitles the source marks as default', () => {
            expect(pick(json, 'Russian')).toBe('https://s/en.vtt');
            expect(pick(json, '')).toBe('https://s/en.vtt');
        });

        it('gives nothing when no language matches and none is marked as default', () => {
            expect(pick(noDefault, 'Russian')).toBe('');
            expect(pick(noDefault, '')).toBe('');
        });

        it('finds the language even when none is marked as default', () => {
            expect(pick(noDefault, 'Portuguese|English')).toBe('https://s/pt.vtt');
        });

        it('gives nothing for a source without subtitles', () => {
            expect(pick(JSON.stringify({ src: 'https://x/master.m3u8', poster: '' }), 'English')).toBe('');
        });
    });
});
