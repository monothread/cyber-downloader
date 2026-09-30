export function isValidHttpUrl(value: string): boolean {
    try {
        const parsed = new URL(value.trim());
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
        return false;
    }
}

export function splitUrls(input: string): string[] {
    return input
        .split(/\s+/)
        .map((token) => {
            return token.trim();
        })
        .filter((token) => {
            return token.length > 0;
        });
}
