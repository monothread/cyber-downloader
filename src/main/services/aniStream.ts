import { sanitizeQuery } from './aniArgsBuilder';

export interface ResolvedStream {
    url: string;
    subtitleUrl: string | null;
    // The site the stream expects the request to come from.
    referer: string | null;
}

// With the "debug" player ani-cli prints the address of the episode instead of playing it, but not the referer the host of
// the stream wants. This adds it (as "Referer:") so the app can ask for the stream the way ani-cli would.
const ORIGINAL_DEBUG_OUTPUT =
    'debug) printf "All links:\\n%s\\nSelected link:\\n%s\\nSubtitles:\\n%s\\n" "$links" "$video_link" "$sub_link" ;;';
const PATCHED_DEBUG_OUTPUT =
    'debug) printf "All links:\\n%s\\nSelected link:\\n%s\\nSubtitles:\\n%s\\nReferer:\\n%s\\n" "$links" "$video_link" "$sub_link" "$refr" ;;';

// The script with its debug output extended, or null when this is not a version it knows how to change.
export function patchDebugReferer(source: string): string | null {
    return source.includes(ORIGINAL_DEBUG_OUTPUT) ? source.replace(ORIGINAL_DEBUG_OUTPUT, PATCHED_DEBUG_OUTPUT) : null;
}

export function buildStreamArgs(query: string, index: number, episode: string, quality: string): string[] {
    return ['-S', String(index), '-e', episode, '-q', quality, sanitizeQuery(query)];
}

function valueAfter(lines: readonly string[], marker: string): string | null {
    const position = lines.indexOf(marker);
    const next = position === -1 ? undefined : lines[position + 1];
    return next !== undefined && /^https?:\/\//.test(next) ? next : null;
}

// Reads what the debug player printed. Empty values are not printed as blank lines (the runner drops those), so a marker
// followed by another marker means it had no value.
export function parseStreamOutput(output: string): ResolvedStream | null {
    const lines = output
        .split('\n')
        .map((line) => {
            return line.trim();
        })
        .filter((line) => {
            return line.length > 0;
        });
    const url = valueAfter(lines, 'Selected link:');
    if (url === null) {
        return null;
    }
    return { url, subtitleUrl: valueAfter(lines, 'Subtitles:'), referer: valueAfter(lines, 'Referer:') };
}
