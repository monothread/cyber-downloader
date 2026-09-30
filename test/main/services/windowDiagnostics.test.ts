import { EventEmitter } from 'node:events';
import type { DiagnosticLog } from '@main/services/diagnosticLog';
import { attachWindowDiagnostics, type DiagnosticContents } from '@main/services/windowDiagnostics';

function setup(executeResult: () => Promise<unknown> = () => {
    return Promise.resolve(true);
}) {
    const emitter = new EventEmitter();
    const executeJavaScript = vi.fn(executeResult);
    const contents = Object.assign(emitter, { executeJavaScript }) as unknown as DiagnosticContents;
    const lines: string[] = [];
    const log: DiagnosticLog = {
        path: '/data/diagnostic.log',
        write: (message) => {
            lines.push(message);
        }
    };
    const onBridgeMissing = vi.fn();
    attachWindowDiagnostics(contents, log, { onBridgeMissing });
    return { emitter, executeJavaScript, lines, onBridgeMissing };
}

async function settle(): Promise<void> {
    await new Promise((resolve) => {
        setImmediate(resolve);
    });
}

describe('attachWindowDiagnostics', () => {
    it('logs a preload failure with its stack and reports the missing bridge', () => {
        const { emitter, lines, onBridgeMissing } = setup();
        const error = new Error('Cannot find module');
        error.stack = 'Error: Cannot find module\n    at preload.js:1';
        emitter.emit('preload-error', {}, 'C:\\app\\out\\preload\\index.js', error);
        expect(lines).toEqual(['Preload failed: C:\\app\\out\\preload\\index.js: Error: Cannot find module\n    at preload.js:1']);
        expect(onBridgeMissing).toHaveBeenCalledWith(lines[0]);
    });

    it('uses the message when the preload error has no stack', () => {
        const { emitter, lines } = setup();
        const error = new Error('plain');
        error.stack = undefined;
        emitter.emit('preload-error', {}, '/p.js', error);
        expect(lines).toEqual(['Preload failed: /p.js: plain']);
    });

    it.each(['error', 'warning'])('logs %s messages written by the page', (level) => {
        const { emitter, lines } = setup();
        emitter.emit('console-message', { level, message: 'Something broke', sourceId: 'file:///app/index.js', lineNumber: 12 });
        expect(lines).toEqual([`Page ${level}: Something broke (file:///app/index.js:12)`]);
    });

    it.each(['info', 'debug'])('ignores %s messages written by the page', (level) => {
        const { emitter, lines } = setup();
        emitter.emit('console-message', { level, message: 'noise', sourceId: 'x', lineNumber: 1 });
        expect(lines).toEqual([]);
    });

    it('logs a crashed render process', () => {
        const { emitter, lines } = setup();
        emitter.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 139 });
        expect(lines).toEqual(['Render process gone: crashed (exit code 139)']);
    });

    it('logs a page that failed to load', () => {
        const { emitter, lines } = setup();
        emitter.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', 'file:///app/index.html');
        expect(lines).toEqual(['Page failed to load: ERR_FILE_NOT_FOUND (-6) file:///app/index.html']);
    });

    it('checks for window.api after the page loads and stays quiet when it exists', async () => {
        const { emitter, executeJavaScript, lines, onBridgeMissing } = setup();
        emitter.emit('did-finish-load');
        await settle();
        expect(executeJavaScript).toHaveBeenCalledWith("typeof window.api === 'object' && window.api !== null");
        expect(lines).toEqual([]);
        expect(onBridgeMissing).not.toHaveBeenCalled();
    });

    it('logs and reports a missing window.api after the page loads', async () => {
        const { emitter, lines, onBridgeMissing } = setup(() => {
            return Promise.resolve(false);
        });
        emitter.emit('did-finish-load');
        await settle();
        const reason = 'The page loaded but window.api is missing, so its buttons cannot reach the app.';
        expect(lines).toEqual([reason]);
        expect(onBridgeMissing).toHaveBeenCalledWith(reason);
    });

    it('logs when the window.api check itself fails', async () => {
        const { emitter, lines, onBridgeMissing } = setup(() => {
            return Promise.reject(new Error('frame disposed'));
        });
        emitter.emit('did-finish-load');
        await settle();
        expect(lines).toEqual(['Could not check window.api: Error: frame disposed']);
        expect(onBridgeMissing).not.toHaveBeenCalled();
    });
});
