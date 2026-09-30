import {
    FILE_PREFIX,
    FILE_PRINT_TEMPLATE,
    PROGRESS_PREFIX,
    PROGRESS_TEMPLATE,
    parseFileLine,
    parseProgressLine
} from '@main/services/progressParser';

describe('progress templates', () => {
    it('exposes the yt-dlp progress template', () => {
        expect(PROGRESS_TEMPLATE).toBe(
            'download:CYBERPROG|%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.title)s'
        );
    });

    it('exposes the yt-dlp file print template', () => {
        expect(FILE_PRINT_TEMPLATE).toBe('after_move:CYBERFILE|%(filepath)s');
    });
});

describe('parseProgressLine', () => {
    it('parses a complete progress line', () => {
        expect(parseProgressLine(`${PROGRESS_PREFIX}  14.2%|   4.84MiB/s|00:12|Me at the zoo`)).toEqual({
            percent: 14.2,
            speed: '4.84MiB/s',
            eta: '00:12',
            title: 'Me at the zoo'
        });
    });

    it('keeps pipes inside the title', () => {
        expect(parseProgressLine(`${PROGRESS_PREFIX}50.0%|1MiB/s|00:01|A | B | C`)?.title).toBe('A | B | C');
    });

    it('turns NA and Unknown values into empty strings', () => {
        expect(parseProgressLine(`${PROGRESS_PREFIX}100.0%|Unknown B/s|NA|Title`)).toEqual({
            percent: 100,
            speed: '',
            eta: '',
            title: 'Title'
        });
    });

    it('uses zero when the percentage is not numeric', () => {
        expect(parseProgressLine(`${PROGRESS_PREFIX}NA|1MiB/s|00:01|Title`)?.percent).toBe(0);
    });

    it('returns null for lines without the progress prefix', () => {
        expect(parseProgressLine('[download] Destination: file.mp4')).toBeNull();
        expect(parseProgressLine('')).toBeNull();
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
