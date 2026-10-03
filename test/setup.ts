import '@testing-library/jest-dom/vitest';
import { fakeTextTrackList, type FakeTextTrackList } from './helpers/textTracks';

// jsdom does not implement the list of text tracks of a media element: every video gets an empty one (a test can give its own).
if (typeof HTMLMediaElement !== 'undefined') {
    const lists = new WeakMap<HTMLMediaElement, FakeTextTrackList>();
    Object.defineProperty(HTMLMediaElement.prototype, 'textTracks', {
        configurable: true,
        get(this: HTMLMediaElement): FakeTextTrackList {
            const known = lists.get(this) ?? fakeTextTrackList();
            lists.set(this, known);
            return known;
        }
    });
}
