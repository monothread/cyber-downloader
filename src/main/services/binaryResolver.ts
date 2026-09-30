import { existsSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { BinarySource, Settings } from '@shared/types';

export const YTDLP_COMMAND = 'yt-dlp';
export const FFMPEG_COMMAND = 'ffmpeg';

export interface BinaryLocations {
    bundledDir: string;
    userBinDir: string;
}

export interface ResolvedBinary {
    path: string;
    source: BinarySource;
}

export class BinaryResolver {
    constructor(
        private readonly locations: BinaryLocations,
        private readonly exists: (path: string) => boolean = existsSync
    ) {}

    get userYtdlpPath(): string {
        return join(this.locations.userBinDir, YTDLP_COMMAND);
    }

    get userBinDir(): string {
        return this.locations.userBinDir;
    }

    ytdlp(settings: Settings): ResolvedBinary {
        if (settings.ytdlpPath.length > 0) {
            return { path: settings.ytdlpPath, source: 'custom' };
        }
        if (this.exists(this.userYtdlpPath)) {
            return { path: this.userYtdlpPath, source: 'updated' };
        }
        const bundledPath = join(this.locations.bundledDir, YTDLP_COMMAND);
        if (this.exists(bundledPath)) {
            return { path: bundledPath, source: 'bundled' };
        }
        return { path: YTDLP_COMMAND, source: 'system' };
    }

    ffmpeg(settings: Settings): ResolvedBinary {
        if (settings.ffmpegPath.length > 0) {
            return { path: settings.ffmpegPath, source: 'custom' };
        }
        const bundledPath = join(this.locations.bundledDir, FFMPEG_COMMAND);
        if (this.exists(bundledPath)) {
            return { path: bundledPath, source: 'bundled' };
        }
        return { path: FFMPEG_COMMAND, source: 'system' };
    }

    ffmpegLocation(settings: Settings): string | null {
        const resolved = this.ffmpeg(settings);
        if (resolved.source === 'custom') {
            return resolved.path;
        }
        return resolved.source === 'bundled' ? this.locations.bundledDir : null;
    }

    spawnEnv(baseEnv: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
        if (!this.exists(this.locations.bundledDir)) {
            return baseEnv;
        }
        const currentPath = baseEnv.PATH ?? '';
        const pathValue = currentPath.length > 0 ? `${this.locations.bundledDir}${delimiter}${currentPath}` : this.locations.bundledDir;
        return { ...baseEnv, PATH: pathValue };
    }
}
