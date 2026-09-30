import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class JsonStore<T> {
    constructor(
        private readonly filePath: string,
        private readonly fallback: T
    ) {}

    read(): T {
        try {
            return JSON.parse(readFileSync(this.filePath, 'utf-8')) as T;
        } catch {
            return this.fallback;
        }
    }

    write(value: T): void {
        mkdirSync(dirname(this.filePath), { recursive: true });
        const temporaryPath = `${this.filePath}.tmp`;
        writeFileSync(temporaryPath, JSON.stringify(value, null, 2), 'utf-8');
        renameSync(temporaryPath, this.filePath);
    }
}
