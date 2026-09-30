import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JsonStore } from '@main/services/jsonStore';
import { cleanTempDirs, makeTempDir } from '../../helpers/tempDir';

afterEach(() => {
    cleanTempDirs();
});

describe('JsonStore', () => {
    it('returns the fallback when the file does not exist', () => {
        const store = new JsonStore<{ a: number }>(join(makeTempDir(), 'x.json'), { a: 1 });
        expect(store.read()).toEqual({ a: 1 });
    });

    it('returns the fallback when the file has invalid JSON', () => {
        const path = join(makeTempDir(), 'x.json');
        writeFileSync(path, '{ broken');
        expect(new JsonStore<{ a: number }>(path, { a: 7 }).read()).toEqual({ a: 7 });
    });

    it('writes and reads back a value, creating missing directories', () => {
        const path = join(makeTempDir(), 'nested', 'deep', 'x.json');
        const store = new JsonStore<{ a: number }>(path, { a: 0 });
        store.write({ a: 42 });
        expect(store.read()).toEqual({ a: 42 });
        expect(JSON.parse(readFileSync(path, 'utf-8'))).toEqual({ a: 42 });
    });

    it('does not leave the temporary file behind', () => {
        const path = join(makeTempDir(), 'x.json');
        new JsonStore<number[]>(path, []).write([1, 2]);
        expect(existsSync(`${path}.tmp`)).toBe(false);
    });
});
