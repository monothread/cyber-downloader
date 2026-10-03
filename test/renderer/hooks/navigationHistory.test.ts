import { MAX_NAVIGATION_ENTRIES, NavigationHistory } from '@renderer/hooks/navigationHistory';

interface Page {
    name: string;
    content: string;
}

function page(name: string, content = ''): Page {
    return { name, content };
}

function makeHistory(limit = MAX_NAVIGATION_ENTRIES): NavigationHistory<Page> {
    return new NavigationHistory<Page>(limit, (entry) => {
        return entry.name;
    });
}

describe('NavigationHistory', () => {
    it('keeps the limit at 50 pages', () => {
        expect(MAX_NAVIGATION_ENTRIES).toBe(50);
    });

    it('has nowhere to go while it is empty', () => {
        const history = makeHistory();
        expect(history.back()).toBeNull();
        expect(history.forward()).toBeNull();
    });

    it('has nowhere to go with a single page', () => {
        const history = makeHistory();
        history.record(page('a'));
        expect(history.back()).toBeNull();
        expect(history.forward()).toBeNull();
    });

    it('goes back and forward through the pages in order', () => {
        const history = makeHistory();
        history.record(page('a'));
        history.record(page('b'));
        history.record(page('c'));

        expect(history.back()).toEqual(page('b'));
        expect(history.back()).toEqual(page('a'));
        expect(history.back()).toBeNull();
        expect(history.forward()).toEqual(page('b'));
        expect(history.forward()).toEqual(page('c'));
        expect(history.forward()).toBeNull();
    });

    it('does not move the cursor when going past either end', () => {
        const history = makeHistory();
        history.record(page('a'));
        history.record(page('b'));
        expect(history.forward()).toBeNull();
        expect(history.back()).toEqual(page('a'));
        expect(history.back()).toBeNull();
        expect(history.forward()).toEqual(page('b'));
    });

    it('refreshes the current page instead of adding one when the key is the same', () => {
        const history = makeHistory();
        history.record(page('a', 'loading'));
        history.record(page('b', 'loading'));
        history.record(page('b', 'ready'));

        expect(history.back()).toEqual(page('a', 'loading'));
        expect(history.forward()).toEqual(page('b', 'ready'));
        expect(history.forward()).toBeNull();
    });

    it('drops the pages ahead when a new page is recorded after going back', () => {
        const history = makeHistory();
        history.record(page('a'));
        history.record(page('b'));
        history.record(page('c'));
        history.back();
        history.back();
        history.record(page('d'));

        expect(history.forward()).toBeNull();
        expect(history.back()).toEqual(page('a'));
        expect(history.forward()).toEqual(page('d'));
    });

    it('adds a page that came back to an earlier key when it is not the current one', () => {
        const history = makeHistory();
        history.record(page('a'));
        history.record(page('b'));
        history.record(page('a'));

        expect(history.back()).toEqual(page('b'));
        expect(history.back()).toEqual(page('a'));
        expect(history.back()).toBeNull();
    });

    it('forgets the oldest pages beyond the limit', () => {
        const history = makeHistory(3);
        ['a', 'b', 'c', 'd', 'e'].forEach((name) => {
            history.record(page(name));
        });

        expect(history.back()).toEqual(page('d'));
        expect(history.back()).toEqual(page('c'));
        expect(history.back()).toBeNull();
    });
});
