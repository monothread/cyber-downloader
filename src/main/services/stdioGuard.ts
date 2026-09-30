export interface ErrorEmitterLike {
    on: (event: 'error', listener: (error: NodeJS.ErrnoException) => void) => unknown;
}

// When the app is launched from a file manager there is no terminal, so stdout/stderr can be
// closed pipes. Writing a log line to them emits an 'error' event (EPIPE) that would otherwise
// surface as an uncaught exception dialog. Logging is never critical, so these errors are ignored.
export function ignoreStdioErrors(streams: ErrorEmitterLike[] = [process.stdout, process.stderr]): void {
    streams.forEach((stream) => {
        stream.on('error', () => {
            return undefined;
        });
    });
}
