import type { LanguageCode } from '@shared/types';
import { cleanSubtitleName, subtitleDisplayName, subtitleDisplayNames } from '@renderer/components/subtitleName';

const LANGUAGES: readonly LanguageCode[] = ['en', 'pt', 'es', 'ja', 'zh'];

// The names the source wrote for one anime, and how each language of the app writes them.
const REAL_NAMES: ReadonlyArray<readonly [string, Record<LanguageCode, string>]> = [
    ['Arabic', { en: 'Arabic', pt: 'Árabe', es: 'Árabe', ja: 'アラビア語', zh: '阿拉伯语' }],
    ['English', { en: 'English', pt: 'Inglês', es: 'Inglés', ja: '英語', zh: '英语' }],
    ['French', { en: 'French', pt: 'Francês', es: 'Francés', ja: 'フランス語', zh: '法语' }],
    ['German', { en: 'German', pt: 'Alemão', es: 'Alemán', ja: 'ドイツ語', zh: '德语' }],
    ['Italian', { en: 'Italian', pt: 'Italiano', es: 'Italiano', ja: 'イタリア語', zh: '意大利语' }],
    [
        'Portuguese (- Portuguese(Brazil))',
        { en: 'Portuguese (Brazil)', pt: 'Português (Brasil)', es: 'Portugués (Brasil)', ja: 'ポルトガル語 (ブラジル)', zh: '葡萄牙语（巴西）' }
    ],
    ['Russian', { en: 'Russian', pt: 'Russo', es: 'Ruso', ja: 'ロシア語', zh: '俄语' }],
    ['Spanish', { en: 'Spanish', pt: 'Espanhol', es: 'Español', ja: 'スペイン語', zh: '西班牙语' }],
    [
        'Spanish (- Spanish(Latin America))',
        { en: 'Spanish (Latin America)', pt: 'Espanhol (América Latina)', es: 'Español (Latinoamérica)', ja: 'スペイン語 (ラテンアメリカ)', zh: '西班牙语（拉丁美洲）' }
    ]
];

describe('subtitleDisplayName', () => {
    describe.each(REAL_NAMES)('%s', (label, written) => {
        it.each(LANGUAGES)('is written in "%s"', (language) => {
            expect(subtitleDisplayName(label, language)).toBe(written[language]);
        });
    });

    it('starts with a capital letter, as the names of languages do in the lists of the app', () => {
        expect(subtitleDisplayName('English', 'pt')).toBe('Inglês');
        expect(subtitleDisplayName('Portuguese (- Portuguese(Brazil))', 'es')).toBe('Portugués (Brasil)');
    });

    it('reads a region written with a country that is not the language, and a plain one', () => {
        expect(subtitleDisplayName('Portuguese (Portugal)', 'pt')).toBe('Português (Portugal)');
        expect(subtitleDisplayName('Portuguese (- Portuguese(Portugal))', 'en')).toBe('Portuguese (Portugal)');
        expect(subtitleDisplayName('Spanish (- Spanish(Mexico))', 'pt')).toBe('Espanhol (México)');
    });

    it('reads a region written after the dash, without a second pair of parentheses', () => {
        expect(subtitleDisplayName('Portuguese (- Brazil)', 'pt')).toBe('Português (Brasil)');
    });

    it('does not repeat the language as if it were a region', () => {
        expect(subtitleDisplayName('Spanish (- Spanish)', 'pt')).toBe('Espanhol');
        expect(subtitleDisplayName('Spanish (Spanish)', 'en')).toBe('Spanish');
    });

    it('knows a language by its English name whatever the case and the spaces around it', () => {
        expect(subtitleDisplayName(' english ', 'pt')).toBe('Inglês');
        expect(subtitleDisplayName('ENGLISH', 'es')).toBe('Inglés');
    });

    it('keeps a region it does not know as it was written, with the language in the language of the app', () => {
        expect(subtitleDisplayName('Portuguese (- Portuguese(Narnia))', 'pt')).toBe('Português (Narnia)');
        expect(subtitleDisplayName('Chinese (- Chinese(Simplified))', 'es')).toBe('Chino (Simplified)');
    });

    it('shows a language it does not know clean and in English', () => {
        expect(subtitleDisplayName('Klingon', 'pt')).toBe('Klingon');
        expect(subtitleDisplayName('Klingon (- Klingon(Qo))', 'pt')).toBe('Klingon (Qo)');
    });

    it('leaves alone what is not the name of a language of the source', () => {
        ['Default', 'Subtitles', 'aula', 'Português'].forEach((label) => {
            expect(subtitleDisplayName(label, 'pt')).toBe(label);
        });
    });

    it('gives back what it cannot read as it came', () => {
        ['', '___', 'English - SDH', 'English (', 'English 2', '(English)', 'English / CC'].forEach((label) => {
            expect(subtitleDisplayName(label, 'pt')).toBe(label);
        });
    });
});

describe('cleanSubtitleName', () => {
    it('takes the noise out and keeps the language and the region in English', () => {
        expect(cleanSubtitleName('Portuguese (- Portuguese(Brazil))')).toBe('Portuguese (Brazil)');
        expect(cleanSubtitleName('Spanish (- Spanish(Latin America))')).toBe('Spanish (Latin America)');
        expect(cleanSubtitleName('Portuguese (- Brazil)')).toBe('Portuguese (Brazil)');
        expect(cleanSubtitleName('Spanish (- Spanish)')).toBe('Spanish');
    });

    it('leaves a name without noise, and what it cannot read, as it is', () => {
        expect(cleanSubtitleName('English')).toBe('English');
        expect(cleanSubtitleName('Portuguese (Brazil)')).toBe('Portuguese (Brazil)');
        expect(cleanSubtitleName('English - SDH')).toBe('English - SDH');
        expect(cleanSubtitleName('___')).toBe('___');
    });
});

describe('subtitleDisplayNames', () => {
    it('writes every name of the list, in order', () => {
        expect(subtitleDisplayNames(REAL_NAMES.map((entry) => {
            return entry[0];
        }), 'pt')).toEqual(REAL_NAMES.map((entry) => {
            return entry[1].pt;
        }));
    });

    it('tells apart two names that would be written the same: the second is shown clean, in English', () => {
        expect(subtitleDisplayNames(['Portuguese (- Portuguese(Brazil))', 'Portuguese (Brazil)'], 'pt')).toEqual(['Português (Brasil)', 'Portuguese (Brazil)']);
        expect(subtitleDisplayNames(['Spanish', 'spanish'], 'pt')).toEqual(['Espanhol', 'spanish']);
    });

    it('shows the second as it came when even the clean name is taken', () => {
        expect(subtitleDisplayNames(['Spanish', 'Portuguese', 'Spanish'], 'en')).toEqual(['Spanish', 'Portuguese', 'Spanish']);
        expect(subtitleDisplayNames(['English', 'english', 'English '], 'en')).toEqual(['English', 'english', 'English ']);
    });

    it('is empty for an empty list', () => {
        expect(subtitleDisplayNames([], 'pt')).toEqual([]);
    });
});
