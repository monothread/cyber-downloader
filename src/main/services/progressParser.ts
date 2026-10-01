import type { DownloadInfo, PostProcessEvent, ProgressInfo } from '@shared/types';

export const PROGRESS_PREFIX = 'CYBERPROG|';
export const FILE_PREFIX = 'CYBERFILE|';
export const INFO_PREFIX = 'CYBERINFO|';
export const POSTPROCESS_PREFIX = 'CYBERPP|';

export const PROGRESS_TEMPLATE = `download:${PROGRESS_PREFIX}%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(progress.downloaded_bytes)s|%(progress.elapsed)s|%(info.is_live)s|%(info.title)s`;
// Printed when each post-processor starts and finishes. Unlike its own `[Merger]`-style lines it also works in quiet mode.
export const POSTPROCESS_TEMPLATE = `postprocess:${POSTPROCESS_PREFIX}%(progress.status)s|%(progress.postprocessor)s`;
// Printed right before each download starts: tells whether it is a live stream and where the file is being written.
export const INFO_PRINT_TEMPLATE = `before_dl:${INFO_PREFIX}%(is_live)s|%(filename)s`;
export const FILE_PRINT_TEMPLATE = `after_move:${FILE_PREFIX}%(filepath)s`;

const NOT_AVAILABLE_VALUES = new Set(['NA', 'N/A', 'Unknown', 'Unknown B/s']);

function cleanValue(value: string): string {
    const trimmed = value.trim();
    return NOT_AVAILABLE_VALUES.has(trimmed) ? '' : trimmed;
}

export function parseProgressLine(line: string): ProgressInfo | null {
    if (!line.startsWith(PROGRESS_PREFIX)) {
        return null;
    }
    const [percentPart = '', speedPart = '', etaPart = '', bytesPart = '', elapsedPart = '', livePart = '', ...titleParts] = line
        .slice(PROGRESS_PREFIX.length)
        .split('|');
    const percent = parseFloat(percentPart);
    return {
        percent: Number.isFinite(percent) ? percent : 0,
        speed: cleanValue(speedPart),
        eta: cleanValue(etaPart),
        title: cleanValue(titleParts.join('|')),
        downloadedBytes: parseNumber(bytesPart),
        elapsedSeconds: parseNumber(elapsedPart),
        live: livePart.trim() === 'True'
    };
}

function parseNumber(value: string): number | null {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
}

export function parseInfoLine(line: string): DownloadInfo | null {
    if (!line.startsWith(INFO_PREFIX)) {
        return null;
    }
    const [livePart = '', ...pathParts] = line.slice(INFO_PREFIX.length).split('|');
    const filePath = pathParts.join('|').trim();
    return filePath.length > 0 ? { live: livePart.trim() === 'True', filePath } : null;
}

export function parsePostProcessLine(line: string): PostProcessEvent | null {
    if (!line.startsWith(POSTPROCESS_PREFIX)) {
        return null;
    }
    const [statusPart = '', ...processorParts] = line.slice(POSTPROCESS_PREFIX.length).split('|');
    const status = statusPart.trim();
    const processor = cleanValue(processorParts.join('|'));
    if ((status !== 'started' && status !== 'finished') || processor.length === 0) {
        return null;
    }
    return { status, processor };
}

// yt-dlp prints "[wait] ..." lines (only when it is not quiet) while it waits for a scheduled live stream to start.
export const WAIT_PREFIX = '[wait]';

export function isWaitLine(line: string): boolean {
    return line.startsWith(WAIT_PREFIX);
}

export function parseFileLine(line: string): string | null {
    if (!line.startsWith(FILE_PREFIX)) {
        return null;
    }
    const filePath = line.slice(FILE_PREFIX.length).trim();
    return filePath.length > 0 ? filePath : null;
}
