import type { DownloadError, ErrorCode } from '@shared/types';

interface ErrorRule {
    code: ErrorCode;
    title: string;
    hint: string;
    patterns: RegExp[];
}

const RAW_LIMIT = 4000;

const ERROR_RULES: ErrorRule[] = [
    {
        code: 'FILENAME_TOO_LONG',
        title: 'Title too long',
        hint: 'Reduce the maximum title length in the settings.',
        patterns: [/file name too long/i, /filename too long/i, /errno 36/i]
    },
    {
        code: 'FFMPEG_MISSING',
        title: 'ffmpeg not found',
        hint: 'Install ffmpeg or set its path in the settings.',
        patterns: [/ffmpeg (is )?not (found|installed)/i, /ffprobe and ffmpeg not found/i, /ffmpeg or avconv not found/i]
    },
    {
        code: 'LOGIN_REQUIRED',
        title: 'Login required',
        hint: 'Enable browser cookies in the settings and make sure you are logged in.',
        patterns: [/sign in/i, /log ?in (is )?required/i, /age[- ]restricted/i, /confirm you.{1,3}re not a bot/i, /members[- ]only/i]
    },
    {
        code: 'UNAVAILABLE',
        title: 'Video unavailable',
        hint: 'The video may be private, removed or blocked in your region.',
        patterns: [/video unavailable/i, /private video/i, /has been removed/i, /not available/i, /does not exist/i, /is private/i]
    },
    {
        code: 'OUTDATED',
        title: 'yt-dlp may be outdated',
        hint: 'Use the update button to get the latest yt-dlp.',
        patterns: [/unable to extract/i, /please update/i, /yt-dlp -u/i, /unsupported url/i]
    },
    {
        code: 'NETWORK',
        title: 'Network failure',
        hint: 'Check your connection and try again.',
        patterns: [
            /unable to download/i,
            /timed out/i,
            /temporary failure in name resolution/i,
            /network is unreachable/i,
            /connection (reset|refused|aborted)/i,
            /getaddrinfo/i,
            /http error 5\d\d/i
        ]
    }
];

function truncateRaw(text: string): string {
    const trimmed = text.trim();
    return trimmed.length > RAW_LIMIT ? trimmed.slice(-RAW_LIMIT) : trimmed;
}

export function mapDownloadError(stderr: string, exitCode: number | null): DownloadError {
    const raw = truncateRaw(stderr);
    const matchedRule = ERROR_RULES.find((rule) => {
        return rule.patterns.some((pattern) => {
            return pattern.test(raw);
        });
    });
    if (matchedRule) {
        return { code: matchedRule.code, title: matchedRule.title, hint: matchedRule.hint, raw };
    }
    return {
        code: 'UNKNOWN',
        title: 'Download failed',
        hint: 'See the details below.',
        raw: raw.length > 0 ? raw : `yt-dlp exited with code ${exitCode ?? 'unknown'}`
    };
}

export function mapSpawnError(error: NodeJS.ErrnoException): DownloadError {
    if (error.code === 'ENOENT') {
        return {
            code: 'BINARY_MISSING',
            title: 'yt-dlp not found',
            hint: 'Install yt-dlp or set its path in the settings.',
            raw: error.message
        };
    }
    return { code: 'UNKNOWN', title: 'Could not start yt-dlp', hint: 'See the details below.', raw: error.message };
}
