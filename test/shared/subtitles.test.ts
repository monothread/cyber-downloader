import { hasUnboundedAutoSubtitles } from '@shared/subtitles';

describe('hasUnboundedAutoSubtitles', () => {
    it('flags auto-generated subtitles with no language', () => {
        expect(hasUnboundedAutoSubtitles({ writeSubtitles: true, autoSubtitles: true, subtitleLangs: '' })).toBe(true);
    });

    it('flags auto-generated subtitles with only whitespace as language', () => {
        expect(hasUnboundedAutoSubtitles({ writeSubtitles: true, autoSubtitles: true, subtitleLangs: '   ' })).toBe(true);
    });

    it.each(['all', 'ALL', ' all '])('flags the "%s" language selector', (subtitleLangs) => {
        expect(hasUnboundedAutoSubtitles({ writeSubtitles: true, autoSubtitles: true, subtitleLangs })).toBe(true);
    });

    it.each(['ja', 'en,pt', 'ja,all'])('accepts the explicit languages "%s"', (subtitleLangs) => {
        expect(hasUnboundedAutoSubtitles({ writeSubtitles: true, autoSubtitles: true, subtitleLangs })).toBe(false);
    });

    it('does not flag anything when auto-generated subtitles are off', () => {
        expect(hasUnboundedAutoSubtitles({ writeSubtitles: true, autoSubtitles: false, subtitleLangs: '' })).toBe(false);
    });

    it('does not flag anything when subtitles are off', () => {
        expect(hasUnboundedAutoSubtitles({ writeSubtitles: false, autoSubtitles: true, subtitleLangs: '' })).toBe(false);
    });
});
