import { FALLBACK_LANGUAGE, LANGUAGE_CODES } from '../constants';
import type { LanguageCode, LanguageSetting } from '../types';
import { en, type MessageKey, type Messages } from './en';
import { es } from './es';
import { ja } from './ja';
import { pt } from './pt';
import { zh } from './zh';

export type { MessageKey, Messages };
export type MessageParams = Record<string, string | number>;
export type Translator = (key: MessageKey, params?: MessageParams) => string;

export const CATALOGS: Record<LanguageCode, Messages> = { en, pt, es, zh, ja };

// Each language is named in itself so it can be found even when the interface is in a language the user cannot read.
export const LANGUAGE_NAMES: Record<LanguageCode, string> = {
    en: 'English',
    pt: 'Português',
    es: 'Español',
    zh: '中文',
    ja: '日本語'
};

function isLanguageCode(value: string): value is LanguageCode {
    return LANGUAGE_CODES.some((code) => {
        return code === value;
    });
}

// "pt-BR" and "zh_CN" are matched by their primary subtag; anything unsupported falls back to English.
export function languageFromLocale(locale: string | null | undefined): LanguageCode {
    const primary = (locale ?? '').toLowerCase().split(/[-_]/)[0] ?? '';
    return isLanguageCode(primary) ? primary : FALLBACK_LANGUAGE;
}

export function resolveLanguage(setting: LanguageSetting, systemLocale: string | null | undefined): LanguageCode {
    return setting === 'device' ? languageFromLocale(systemLocale) : setting;
}

export function interpolate(template: string, params: MessageParams | undefined): string {
    if (params === undefined) {
        return template;
    }
    return template.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
        const value = params[name];
        return value === undefined ? placeholder : String(value);
    });
}

export function createTranslator(language: LanguageCode): Translator {
    const messages = CATALOGS[language];
    return (key, params) => {
        return interpolate(messages[key], params);
    };
}
