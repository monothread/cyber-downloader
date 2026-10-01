import type { AnimeSubtitleSetting } from '@shared/anime';
import type { LanguageCode } from '@shared/types';

export const SUBTITLE_LABELS_VARIABLE = 'PULLWAVE_SUB_LABELS';
export const SUBTITLE_FALLBACK_LABEL = 'English';

// The name the source gives the subtitles of each language of the app. Chinese and Japanese have none of their own.
const LABEL_OF_LANGUAGE: Record<LanguageCode, string> = {
    en: 'English',
    pt: 'Portuguese',
    es: 'Spanish',
    zh: SUBTITLE_FALLBACK_LABEL,
    ja: SUBTITLE_FALLBACK_LABEL
};

// The languages to try, in order. After them ani-cli's own pick (the subtitles the source marks as default) is used, so an
// empty list leaves ani-cli as it is.
export function subtitleLabels(setting: AnimeSubtitleSetting, language: LanguageCode): string[] {
    if (setting === 'default') {
        return [];
    }
    if (setting === 'auto') {
        return [...new Set([LABEL_OF_LANGUAGE[language], SUBTITLE_FALLBACK_LABEL])];
    }
    return [setting];
}

// ani-cli saves only the subtitles the source marks as default, and many titles have none marked. This is the line that
// does it, and the function that takes its place: it tries the languages in PULLWAVE_SUB_LABELS (separated by "|") and then
// does what ani-cli did.
const ORIGINAL_SELECTION =
    `    sub_link="$(printf "%s" "$_json" | sed 's|.*"subtitles":\\[||; s|}\\].*||; s|},{|}\\n{|g' | grep -m 1 '"default":true' | sed -nE 's|.*"src":"([^"]*)".*|\\1|p')"`;
const PATCHED_SELECTION = '    sub_link="$(pullwave_pick_subtitle "$_json")"';
const FUNCTION_ANCHOR = 'hianime_m3u8() {';
export const SUBTITLE_PICK_FUNCTION = `# Added by Pullwave: prefers the languages in ${SUBTITLE_LABELS_VARIABLE}, then the subtitles marked as default.
pullwave_pick_subtitle() {
    _subs="$(printf "%s" "$1" | sed 's|.*"subtitles":\\[||; s|}\\].*||; s|},{|}\\n{|g')"
    _pick=""
    _old_ifs="$IFS"
    IFS='|'
    for _label in $${SUBTITLE_LABELS_VARIABLE}; do
        _pick="$(printf "%s\\n" "$_subs" | grep -i -m 1 "\\"label\\":\\"[^\\"]*$_label")"
        [ -n "$_pick" ] && break
    done
    IFS="$_old_ifs"
    [ -n "$_pick" ] || _pick="$(printf "%s\\n" "$_subs" | grep -m 1 '"default":true')"
    printf "%s" "$_pick" | sed -nE 's|.*"src":"([^"]*)".*|\\1|p'
}

`;

// The script with its subtitle selection replaced, or null when this is not a version it knows how to change (it is then
// used as it is, and the subtitles are whatever ani-cli picks).
export function patchSubtitleSelection(source: string): string | null {
    if (!source.includes(ORIGINAL_SELECTION) || !source.includes(`\n${FUNCTION_ANCHOR}`)) {
        return null;
    }
    return source.replace(ORIGINAL_SELECTION, PATCHED_SELECTION).replace(`\n${FUNCTION_ANCHOR}`, `\n${SUBTITLE_PICK_FUNCTION}${FUNCTION_ANCHOR}`);
}
