import { readdirSync, rmSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

export interface DirectoryEntry {
    name: string;
    isFile: boolean;
}

export type ListDirectory = (dir: string) => DirectoryEntry[];

// What yt-dlp leaves behind for an unfinished download: the .part file, its .ytdl resume record and fragment pieces.
const LEFTOVER_SUFFIX = '(?:\\.part|\\.ytdl|\\.part-Frag\\d+(?:\\.part)?)';

function escapeForPattern(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function defaultListDirectory(dir: string): DirectoryEntry[] {
    try {
        return readdirSync(dir, { withFileTypes: true }).map((entry) => {
            return { name: entry.name, isFile: entry.isFile() };
        });
    } catch {
        return [];
    }
}

// The unfinished files of ONE download, found from the final name yt-dlp reported for it: `<name>.part` and, when video and
// audio are downloaded apart, `<stem>.f<format>.<ext>.part`. Finished files, including complete per-format ones, are never listed.
export function findPartialFiles(finalPath: string, listDirectory: ListDirectory = defaultListDirectory): string[] {
    const name = basename(finalPath);
    const extension = extname(name);
    const stem = extension.length > 0 ? name.slice(0, -extension.length) : name;
    if (stem.length === 0) {
        return [];
    }
    const sameName = new RegExp(`^${escapeForPattern(name)}${LEFTOVER_SUFFIX}$`);
    const perFormat = new RegExp(`^${escapeForPattern(stem)}\\.f[A-Za-z0-9_-]+\\.[A-Za-z0-9]+${LEFTOVER_SUFFIX}$`);
    const dir = dirname(finalPath);
    return listDirectory(dir)
        .filter((entry) => {
            return entry.isFile && (sameName.test(entry.name) || perFormat.test(entry.name));
        })
        .map((entry) => {
            return join(dir, entry.name);
        });
}

// A file that cannot be deleted (still open on Windows, for instance) is left alone; the others are still removed.
export function removeFiles(paths: readonly string[], remove: (path: string) => void = defaultRemove): void {
    paths.forEach((path) => {
        try {
            remove(path);
        } catch {
            return;
        }
    });
}

function defaultRemove(path: string): void {
    rmSync(path, { force: true });
}
