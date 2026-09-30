import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { ignoreStdioErrors } from '@main/services/stdioGuard';

describe('ignoreStdioErrors', () => {
    it('registers an error listener on every stream', () => {
        const first = new EventEmitter();
        const second = new EventEmitter();
        ignoreStdioErrors([first, second]);
        expect(first.listenerCount('error')).toBe(1);
        expect(second.listenerCount('error')).toBe(1);
    });

    it('swallows EPIPE errors instead of throwing', () => {
        const stream = new PassThrough();
        ignoreStdioErrors([stream]);
        const epipe = Object.assign(new Error('write EPIPE'), { code: 'EPIPE' });
        expect(() => {
            stream.emit('error', epipe);
        }).not.toThrow();
    });

    it('swallows any other stdio error too', () => {
        const stream = new EventEmitter();
        ignoreStdioErrors([stream]);
        expect(() => {
            stream.emit('error', Object.assign(new Error('write EBADF'), { code: 'EBADF' }));
        }).not.toThrow();
    });

    it('throws for an unguarded emitter, proving the guard is what prevents the crash', () => {
        const stream = new PassThrough();
        expect(() => {
            stream.emit('error', new Error('write EPIPE'));
        }).toThrow('write EPIPE');
    });

    it('guards process.stdout and process.stderr by default', () => {
        const stdoutBefore = process.stdout.listenerCount('error');
        const stderrBefore = process.stderr.listenerCount('error');
        ignoreStdioErrors();
        expect(process.stdout.listenerCount('error')).toBe(stdoutBefore + 1);
        expect(process.stderr.listenerCount('error')).toBe(stderrBefore + 1);
    });
});
