import type { DownloadInfo, ProgressInfo } from '@shared/types';
import { createLineSplitter, defaultSpawn, runYtdlp } from '@main/services/ytdlpRunner';
import { createFakeChild } from '../../helpers/fakeChild';

describe('createLineSplitter', () => {
    it('emits complete lines and buffers partial ones', () => {
        const lines: string[] = [];
        const splitter = createLineSplitter((line) => {
            lines.push(line);
        });
        splitter.push('one\ntw');
        splitter.push('o\r\nthree');
        expect(lines).toEqual(['one', 'two']);
        splitter.flush();
        expect(lines).toEqual(['one', 'two', 'three']);
    });

    it('does not emit anything on flush with an empty buffer', () => {
        const onLine = vi.fn();
        const splitter = createLineSplitter(onLine);
        splitter.push('a\n');
        onLine.mockClear();
        splitter.flush();
        expect(onLine).not.toHaveBeenCalled();
    });
});

describe('runYtdlp', () => {
    function start(): { fake: ReturnType<typeof createFakeChild>; spawnFn: ReturnType<typeof vi.fn>; progress: ProgressInfo[]; infos: DownloadInfo[]; run: ReturnType<typeof runYtdlp> } {
        const fake = createFakeChild();
        const spawnFn = vi.fn(() => {
            return fake.child;
        });
        const progress: ProgressInfo[] = [];
        const infos: DownloadInfo[] = [];
        const run = runYtdlp({
            binary: 'yt-dlp',
            args: ['--newline', 'https://x.com/v'],
            env: { PATH: '/bundled:/usr/bin' },
            spawnFn,
            onProgress: (info) => {
                progress.push(info);
            },
            onInfo: (info) => {
                infos.push(info);
            }
        });
        return { fake, spawnFn, progress, infos, run };
    }

    it('spawns the binary with the exact arguments and environment', () => {
        const { spawnFn } = start();
        expect(spawnFn).toHaveBeenCalledWith('yt-dlp', ['--newline', 'https://x.com/v'], { PATH: '/bundled:/usr/bin' });
    });

    it('reports progress and resolves done with the file path', async () => {
        const { fake, progress, run } = start();
        fake.stdout.write('CYBERPROG|  10.0%|1MiB/s|00:09|1000|1.5|False|Title\nCYBERPROG| 100.0%|2MiB/s|00:00|2000|3.5|False|Title\n');
        fake.stdout.write('CYBERFILE|/d/Title [id].mp4\n');
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        fake.emitter.emit('close', 0);
        await expect(run.result).resolves.toEqual({ status: 'done', filePath: '/d/Title [id].mp4' });
        expect(progress).toEqual([
            { percent: 10, speed: '1MiB/s', eta: '00:09', title: 'Title', downloadedBytes: 1000, elapsedSeconds: 1.5, live: false },
            { percent: 100, speed: '2MiB/s', eta: '00:00', title: 'Title', downloadedBytes: 2000, elapsedSeconds: 3.5, live: false }
        ]);
    });

    it('resolves done with a null file path when none was printed', async () => {
        const { fake, run } = start();
        fake.emitter.emit('close', 0);
        await expect(run.result).resolves.toEqual({ status: 'done', filePath: null });
    });

    it('handles a final line without newline on close', async () => {
        const { fake, run } = start();
        fake.stdout.write('CYBERFILE|/d/last.mp4');
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        fake.emitter.emit('close', 0);
        await expect(run.result).resolves.toEqual({ status: 'done', filePath: '/d/last.mp4' });
    });

    it('resolves with a mapped error on non-zero exit', async () => {
        const { fake, run } = start();
        fake.stderr.write('ERROR: Video unavailable\n');
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        fake.emitter.emit('close', 1);
        await expect(run.result).resolves.toEqual({
            status: 'error',
            error: {
                code: 'UNAVAILABLE',
                title: 'Video unavailable',
                hint: 'The video may be private, removed or blocked in your region.',
                raw: 'ERROR: Video unavailable'
            }
        });
    });

    it('resolves with BINARY_MISSING when spawn fails with ENOENT', async () => {
        const { fake, run } = start();
        fake.emitter.emit('error', Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' }));
        await expect(run.result).resolves.toEqual({
            status: 'error',
            error: {
                code: 'BINARY_MISSING',
                title: 'yt-dlp not found',
                hint: 'Install yt-dlp or set its path in the settings.',
                raw: 'spawn yt-dlp ENOENT'
            }
        });
    });

    it('reports the start of each download, telling whether it is live and where the file goes', async () => {
        const { fake, progress, infos, run } = start();
        fake.stdout.write('CYBERINFO|True|/d/Live [x].mp4\nCYBERPROG|NA|1MiB/s|NA|10|1.0|True|Live\n');
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        fake.emitter.emit('close', 0);
        await run.result;
        expect(infos).toEqual([{ live: true, filePath: '/d/Live [x].mp4' }]);
        expect(progress).toHaveLength(1);
        expect(progress[0]?.live).toBe(true);
    });

    it('does not report an info line that has no path', async () => {
        const { fake, infos, run } = start();
        fake.stdout.write('CYBERINFO|True|\n');
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        fake.emitter.emit('close', 0);
        await run.result;
        expect(infos).toEqual([]);
    });

    it('works without an info listener', async () => {
        const fake = createFakeChild();
        const run = runYtdlp({ binary: 'yt-dlp', args: [], spawnFn: () => {return fake.child}, onProgress: () => {return undefined} });
        fake.stdout.write('CYBERINFO|True|/d/v.mp4\n');
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        fake.emitter.emit('close', 0);
        await expect(run.result).resolves.toEqual({ status: 'done', filePath: null });
    });

    it('stop sends SIGINT so yt-dlp finishes and keeps the recording, which then completes normally', async () => {
        const { fake, run } = start();
        fake.stdout.write('CYBERINFO|True|/d/Live.mp4\n');
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        run.stop();
        expect(fake.kill).toHaveBeenCalledWith('SIGINT');
        fake.stdout.write('CYBERFILE|/d/Live.mp4\n');
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        fake.emitter.emit('close', 0);
        await expect(run.result).resolves.toEqual({ status: 'done', filePath: '/d/Live.mp4' });
    });

    it('stop is not a cancellation: a failure after it is still reported as an error', async () => {
        const { fake, run } = start();
        run.stop();
        fake.stderr.write('ERROR: Interrupted by user\n');
        await new Promise((resolve) => {
            setImmediate(resolve);
        });
        fake.emitter.emit('close', 1);
        const result = await run.result;
        expect(result.status).toBe('error');
    });

    it('kills the process with SIGTERM and resolves cancelled', async () => {
        const { fake, run } = start();
        run.cancel();
        expect(fake.kill).toHaveBeenCalledWith('SIGTERM');
        fake.emitter.emit('close', null);
        await expect(run.result).resolves.toEqual({ status: 'cancelled' });
    });
});

describe('defaultSpawn', () => {
    it('passes the given environment to the process', async () => {
        const child = defaultSpawn(process.execPath, ['-e', 'process.stdout.write(process.env.CYBER_TEST ?? "unset")'], { CYBER_TEST: 'yes' });
        const output = await new Promise<string>((resolve) => {
            let data = '';
            child.stdout.on('data', (chunk: Buffer) => {
                data += chunk.toString();
            });
            child.on('close', () => {
                resolve(data);
            });
        });
        expect(output).toBe('yes');
    });

    it('spawns a real process', async () => {
        const child = defaultSpawn(process.execPath, ['-e', 'process.stdout.write("ok")']);
        const output = await new Promise<string>((resolve) => {
            let data = '';
            child.stdout.on('data', (chunk: Buffer) => {
                data += chunk.toString();
            });
            child.on('close', () => {
                resolve(data);
            });
        });
        expect(output).toBe('ok');
    });
});
