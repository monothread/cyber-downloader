import {
    FILE_PREFIX,
    FILE_PRINT_TEMPLATE,
    INFO_PREFIX,
    INFO_PRINT_TEMPLATE,
    PROGRESS_PREFIX,
    PROGRESS_TEMPLATE,
    parseFileLine,
    parseInfoLine,
    parseProgressLine
} from '@main/services/progressParser';

describe('progress templates', () => {
    it('exposes the yt-dlp progress template', () => {
        expect(PROGRESS_TEMPLATE).toBe(
            'download:CYBERPROG|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.elapsed)s|%(info.is_live)s|%(info.title)s'
        );
    });

    it('exposes the yt-dlp file print template', () => {
        expect(FILE_PRINT_TEMPLATE).toBe('after_move:CYBERFILE|%(filepath)s');
    });

    it('exposes the template that announces each download and whether it is live', () => {
        expect(INFO_PRINT_TEMPLATE).toBe('before_dl:CYBERINFO|%(is_live)s|%(filename)s');
    });
});

describe('parseProgressLine', () => {
    it('parses a complete progress line', () => {
        expect(parseProgressLine(`${PROGRESS_PREFIX}  14.2%|   4.84MiB/s|00:12|1048576|3.5|False|Me at the zoo`)).toEqual({
            percent: 14.2,
            speed: '4.84MiB/s',
            eta: '00:12',
            title: 'Me at the zoo',
            downloadedBytes: 1048576,
            elapsedSeconds: 3.5,
            live: false
        });
    });

    it('recognises a live stream', () => {
        expect(parseProgressLine(`${PROGRESS_PREFIX}100.0%|39.46KiB/s|NA|648600|16.05|True|index 2026`)).toEqual({
            percent: 100,
            speed: '39.46KiB/s',
            eta: '',
            title: 'index 2026',
            downloadedBytes: 648600,
            elapsedSeconds: 16.05,
            live: true
        });
    });

    it.each(['False', 'None', 'NA', ''])('does not treat is_live=%s as live', (value) => {
        expect(parseProgressLine(`${PROGRESS_PREFIX}1.0%|1MiB/s|00:01|10|1|${value}|T`)?.live).toBe(false);
    });

    it('keeps pipes inside the title', () => {
        expect(parseProgressLine(`${PROGRESS_PREFIX}50.0%|1MiB/s|00:01|10|1|False|A | B | C`)?.title).toBe('A | B | C');
    });

    it('turns NA and Unknown values into empty strings or null numbers', () => {
        expect(parseProgressLine(`${PROGRESS_PREFIX}100.0%|Unknown B/s|NA|NA|NA|None|Title`)).toEqual({
            percent: 100,
            speed: '',
            eta: '',
            title: 'Title',
            downloadedBytes: null,
            elapsedSeconds: null,
            live: false
        });
    });

    it('uses zero when the percentage is not numeric (live streams have none)', () => {
        expect(parseProgressLine(`${PROGRESS_PREFIX}NA|1MiB/s|00:01|10|1|True|Title`)?.percent).toBe(0);
    });

    it('returns null for lines without the progress prefix', () => {
        expect(parseProgressLine('[download] Destination: file.mp4')).toBeNull();
        expect(parseProgressLine('')).toBeNull();
    });
});

describe('parseInfoLine', () => {
    it('reads that a download is live and where its file is written', () => {
        expect(parseInfoLine(`${INFO_PREFIX}True|/home/u/Downloads/index 2026 [index].mp4`)).toEqual({
            live: true,
            filePath: '/home/u/Downloads/index 2026 [index].mp4'
        });
    });

    it.each(['False', 'None', 'NA'])('reads is_live=%s as not live', (value) => {
        expect(parseInfoLine(`${INFO_PREFIX}${value}|/d/v.mp4`)).toEqual({ live: false, filePath: '/d/v.mp4' });
    });

    it('keeps pipes inside the path', () => {
        expect(parseInfoLine(`${INFO_PREFIX}True|/d/a | b.mp4`)?.filePath).toBe('/d/a | b.mp4');
    });

    it('returns null without a path or for other lines', () => {
        expect(parseInfoLine(`${INFO_PREFIX}True|`)).toBeNull();
        expect(parseInfoLine(`${INFO_PREFIX}True`)).toBeNull();
        expect(parseInfoLine('CYBERFILE|/d/v.mp4')).toBeNull();
        expect(parseInfoLine('')).toBeNull();
    });
});

describe('parseFileLine', () => {
    it('extracts the file path', () => {
        expect(parseFileLine(`${FILE_PREFIX}/home/u/Downloads/My Video [abc].mp4`)).toBe('/home/u/Downloads/My Video [abc].mp4');
    });

    it('returns null for an empty path', () => {
        expect(parseFileLine(FILE_PREFIX)).toBeNull();
    });

    it('returns null for other lines', () => {
        expect(parseFileLine('CYBERPROG|1%|1|1|t')).toBeNull();
    });
});
