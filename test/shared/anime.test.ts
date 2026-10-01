import { animeMediaUrl, ANIME_MEDIA_SCHEME, ANIME_STREAM_SCHEME, isAnimeSupported } from '@shared/anime';

describe('isAnimeSupported', () => {
    it.each(['linux', 'win32'])('is true on %s', (platform) => {
        expect(isAnimeSupported(platform)).toBe(true);
    });

    it.each(['darwin', 'freebsd', 'android', 'sunos', ''])('is false on %j', (platform) => {
        expect(isAnimeSupported(platform)).toBe(false);
    });
});

describe('animeMediaUrl', () => {
    it('names the schemes the player reads through', () => {
        expect(ANIME_MEDIA_SCHEME).toBe('pullwave-media');
        expect(ANIME_STREAM_SCHEME).toBe('pullwave-stream');
    });

    it('builds the address of the video and of the subtitles of an episode', () => {
        expect(animeMediaUrl('episode', 12)).toBe('pullwave-media://episode/12');
        expect(animeMediaUrl('subtitle', 7)).toBe('pullwave-media://subtitle/7');
    });
});
