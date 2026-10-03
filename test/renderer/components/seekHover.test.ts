import { seekHover } from '@renderer/components/seekHover';

const BAR = { left: 100, width: 200 };

describe('seekHover', () => {
    it.each([
        [100, 0, 0],
        [150, 50, 50],
        [200, 100, 100],
        [300, 200, 200]
    ])('gives the moment under a mouse at %s on a video of 200 seconds', (clientX, offset, time) => {
        expect(seekHover(clientX, BAR, 200)).toEqual({ time, offset });
    });

    it('keeps the mouse inside the timeline', () => {
        expect(seekHover(40, BAR, 200)).toEqual({ time: 0, offset: 0 });
        expect(seekHover(900, BAR, 200)).toEqual({ time: 200, offset: 200 });
    });

    it('scales the moment to the length of the video', () => {
        expect(seekHover(200, BAR, 60)).toEqual({ time: 30, offset: 100 });
    });

    it('gives nothing when the length of the video is not known', () => {
        expect(seekHover(150, BAR, 0)).toBeNull();
    });

    it('gives nothing when the timeline has no width', () => {
        expect(seekHover(150, { left: 100, width: 0 }, 200)).toBeNull();
    });
});
