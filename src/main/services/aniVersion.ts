// ani-cli says its version on one line of the script: version_number="5.1.4".
export function parseAniCliVersion(source: string): string | null {
    return /^version_number="([^"]+)"$/m.exec(source)?.[1] ?? null;
}

// Negative when `first` is older than `second`, zero when they are the same, positive when it is newer. Versions are
// compared number by number ("5.10" is newer than "5.9"); a part that is not a number counts as zero.
export function compareVersions(first: string, second: string): number {
    const left = first.split('.').map(Number);
    const right = second.split('.').map(Number);
    for (let position = 0; position < Math.max(left.length, right.length); position += 1) {
        const difference = (Number.isFinite(left[position]) ? (left[position] ?? 0) : 0) - (Number.isFinite(right[position]) ? (right[position] ?? 0) : 0);
        if (difference !== 0) {
            return difference;
        }
    }
    return 0;
}
