export interface FakeTextTrack {
    id: string;
    mode: TextTrackMode;
}

export type FakeTextTrackList = FakeTextTrack[] & Pick<EventTarget, 'addEventListener' | 'removeEventListener' | 'dispatchEvent'>;

// What `video.textTracks` is in a browser, as far as the player uses it: a list of tracks that tells when it changes. jsdom has no such
// list, so the tests give the video one.
export function fakeTextTrackList(tracks: FakeTextTrack[] = []): FakeTextTrackList {
    const target = new EventTarget();
    return Object.assign(tracks, {
        addEventListener: target.addEventListener.bind(target),
        removeEventListener: target.removeEventListener.bind(target),
        dispatchEvent: target.dispatchEvent.bind(target)
    });
}
