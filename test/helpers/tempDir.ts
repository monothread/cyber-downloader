import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const created: string[] = [];

export function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'cyber-dl-test-'));
    created.push(dir);
    return dir;
}

export function cleanTempDirs(): void {
    created.splice(0).forEach((dir) => {
        rmSync(dir, { recursive: true, force: true });
    });
}
