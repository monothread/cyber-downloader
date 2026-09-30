import type { ProgressInfo } from '@shared/types';

export const PROGRESS_PREFIX = 'CYBERPROG|';
export const FILE_PREFIX = 'CYBERFILE|';

export const PROGRESS_TEMPLATE = `download:${PROGRESS_PREFIX}%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s|%(info.title)s`;
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
    const [percentPart = '', speedPart = '', etaPart = '', ...titleParts] = line.slice(PROGRESS_PREFIX.length).split('|');
    const percent = parseFloat(percentPart);
    return {
        percent: Number.isFinite(percent) ? percent : 0,
        speed: cleanValue(speedPart),
        eta: cleanValue(etaPart),
        title: cleanValue(titleParts.join('|'))
    };
}

export function parseFileLine(line: string): string | null {
    if (!line.startsWith(FILE_PREFIX)) {
        return null;
    }
    const filePath = line.slice(FILE_PREFIX.length).trim();
    return filePath.length > 0 ? filePath : null;
}
