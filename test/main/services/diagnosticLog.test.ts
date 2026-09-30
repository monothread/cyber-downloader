import { createDiagnosticLog, MAX_LOG_BYTES, type DiagnosticFiles } from '@main/services/diagnosticLog';

const LOG_PATH = '/data/diagnostic.log';
const NOW = new Date('2026-09-30T12:00:00.000Z');

function setup(size: number | Error = new Error('ENOENT')) {
    const files: DiagnosticFiles = {
        append: vi.fn(),
        size: vi.fn(() => {
            if (size instanceof Error) {
                throw size;
            }
            return size;
        }),
        reset: vi.fn()
    };
    const log = createDiagnosticLog(LOG_PATH, () => {
        return NOW;
    }, files);
    return { files, log };
}

describe('createDiagnosticLog', () => {
    it('exposes the path of the file', () => {
        expect(setup().log.path).toBe(LOG_PATH);
    });

    it('appends one timestamped line per message', () => {
        const { files, log } = setup(10);
        log.write('Preload failed');
        expect(files.append).toHaveBeenCalledTimes(1);
        expect(files.append).toHaveBeenCalledWith(LOG_PATH, '[2026-09-30T12:00:00.000Z] Preload failed\n');
        expect(files.reset).not.toHaveBeenCalled();
    });

    it('writes even when the file does not exist yet', () => {
        const { files, log } = setup();
        log.write('first');
        expect(files.reset).not.toHaveBeenCalled();
        expect(files.append).toHaveBeenCalledWith(LOG_PATH, '[2026-09-30T12:00:00.000Z] first\n');
    });

    it('starts over when the file is larger than the limit', () => {
        const { files, log } = setup(MAX_LOG_BYTES + 1);
        log.write('after the limit');
        expect(files.reset).toHaveBeenCalledWith(LOG_PATH);
        expect(files.append).toHaveBeenCalledWith(LOG_PATH, '[2026-09-30T12:00:00.000Z] after the limit\n');
    });

    it('keeps the file when it is exactly at the limit', () => {
        const { files, log } = setup(MAX_LOG_BYTES);
        log.write('at the limit');
        expect(files.reset).not.toHaveBeenCalled();
    });

    it('never throws when the file cannot be written', () => {
        const { files, log } = setup(1);
        vi.mocked(files.append).mockImplementation(() => {
            throw new Error('EACCES');
        });
        expect(() => {
            log.write('cannot be saved');
        }).not.toThrow();
    });
});
