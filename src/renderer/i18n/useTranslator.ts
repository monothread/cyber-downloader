import { createTranslator, type Translator } from '@shared/i18n';
import type { LanguageCode } from '@shared/types';
import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { resolveAppLanguage } from './language';

export function useAppLanguage(): LanguageCode {
    const setting = useAppStore((state) => {
        return state.settings.language;
    });
    return resolveAppLanguage(setting);
}

export function useTranslator(): Translator {
    const language = useAppLanguage();
    return useMemo(() => {
        return createTranslator(language);
    }, [language]);
}
