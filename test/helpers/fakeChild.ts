import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

export interface FakeChild {
    child: ChildProcessWithoutNullStreams;
    stdout: PassThrough;
    stderr: PassThrough;
    emitter: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
}

export function createFakeChild(): FakeChild {
    const emitter = new EventEmitter();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const kill = vi.fn();
    Object.assign(emitter, { stdout, stderr, kill });
    return { child: emitter as unknown as ChildProcessWithoutNullStreams, stdout, stderr, emitter, kill };
}
