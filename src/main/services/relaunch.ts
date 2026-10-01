export interface RelaunchOptions {
    execPath?: string;
    args: string[];
}

// An AppImage runs from a temporary mount that disappears on exit, so it has to be started again through the .AppImage file itself.
export function buildRelaunchOptions(env: Record<string, string | undefined>, argv: readonly string[]): RelaunchOptions {
    const args = argv.slice(1);
    const appImage = env.APPIMAGE;
    return appImage ? { execPath: appImage, args } : { args };
}
