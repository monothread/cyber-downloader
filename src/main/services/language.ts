import { FALLBACK_LANGUAGE } from '@shared/constants';
import { createTranslator, resolveLanguage, type Translator } from '@shared/i18n';
import type { LanguageSetting } from '@shared/types';

let translator: Translator = createTranslator(FALLBACK_LANGUAGE);

// The language of the messages the main process creates (errors, tray, dialogs) follows the saved setting.
export function applyLanguage(setting: LanguageSetting, systemLocale: string): void {
    translator = createTranslator(resolveLanguage(setting, systemLocale));
}

export const translateMain: Translator = (key, params) => {
    return translator(key, params);
};
