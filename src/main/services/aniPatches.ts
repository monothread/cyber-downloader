import { patchSubtitleSelection } from './aniSubtitles';
import { patchDebugReferer } from './aniStream';

// Everything Pullwave changes in the script it runs: the choice of subtitles and the referer in the debug output. Each change
// is made on its own, so a version of ani-cli that only fits one of them still gets that one. Null when none fits.
export function patchAniCli(source: string): string | null {
    const patches = [patchSubtitleSelection, patchDebugReferer];
    let result = source;
    patches.forEach((patch) => {
        result = patch(result) ?? result;
    });
    return result === source ? null : result;
}
