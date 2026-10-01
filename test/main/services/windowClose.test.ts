import { applyLanguage } from '@main/services/language';
import { createQuitRequester, decideCloseAction, describePending, requestQuit } from '@main/services/windowClose';

describe('decideCloseAction', () => {
    it('allows the close while quitting, whatever the tray state', () => {
        expect(decideCloseAction({ quitting: true, canHideToTray: true })).toBe('allow');
        expect(decideCloseAction({ quitting: true, canHideToTray: false })).toBe('allow');
    });

    it('hides the window when it can live in the tray', () => {
        expect(decideCloseAction({ quitting: false, canHideToTray: true })).toBe('hide');
    });

    it('asks to quit when there is no tray to hide into', () => {
        expect(decideCloseAction({ quitting: false, canHideToTray: false })).toBe('ask-quit');
    });
});

describe('describePending', () => {
    it('uses the singular for one download', () => {
        expect(describePending(1)).toBe('1 download is still in progress.');
    });

    it('uses the plural otherwise', () => {
        expect(describePending(3)).toBe('3 downloads are still in progress.');
    });

    describe('in another language', () => {
        afterEach(() => {
            applyLanguage('en', 'en-US');
        });

        it('translates the singular and the plural', () => {
            applyLanguage('pt', 'en-US');
            expect(describePending(1)).toBe('1 download ainda está em andamento.');
            expect(describePending(3)).toBe('3 downloads ainda estão em andamento.');
        });
    });
});

describe('requestQuit', () => {
    it('quits straight away without asking when nothing is pending', async () => {
        const confirm = vi.fn(async () => {
            return true;
        });
        const quit = vi.fn();
        await expect(requestQuit({ pendingCount: () => {return 0}, confirm, quit })).resolves.toBe(true);
        expect(confirm).not.toHaveBeenCalled();
        expect(quit).toHaveBeenCalledTimes(1);
    });

    it('asks with the pending count and quits when confirmed', async () => {
        const confirm = vi.fn(async () => {
            return true;
        });
        const quit = vi.fn();
        await expect(requestQuit({ pendingCount: () => {return 2}, confirm, quit })).resolves.toBe(true);
        expect(confirm).toHaveBeenCalledWith(2);
        expect(quit).toHaveBeenCalledTimes(1);
    });

    it('does not quit when the user cancels', async () => {
        const quit = vi.fn();
        await expect(
            requestQuit({
                pendingCount: () => {return 1},
                confirm: async () => {
                    return false;
                },
                quit
            })
        ).resolves.toBe(false);
        expect(quit).not.toHaveBeenCalled();
    });
});

describe('createQuitRequester', () => {
    it('ignores a second request while the first confirmation is still open', async () => {
        let answer: (value: boolean) => void = () => {
            return undefined;
        };
        const confirm = vi.fn(() => {
            return new Promise<boolean>((resolve) => {
                answer = resolve;
            });
        });
        const quit = vi.fn();
        const request = createQuitRequester({ pendingCount: () => {return 1}, confirm, quit });
        const first = request();
        await expect(request()).resolves.toBe(false);
        expect(confirm).toHaveBeenCalledTimes(1);
        answer(true);
        await expect(first).resolves.toBe(true);
        expect(quit).toHaveBeenCalledTimes(1);
    });

    it('allows asking again after the previous request finished', async () => {
        const confirm = vi.fn(async () => {
            return false;
        });
        const request = createQuitRequester({ pendingCount: () => {return 1}, confirm, quit: vi.fn() });
        await request();
        await request();
        expect(confirm).toHaveBeenCalledTimes(2);
    });

    it('releases the lock even when the confirmation throws', async () => {
        const confirm = vi.fn(async () => {
            throw new Error('dialog failed');
        });
        const request = createQuitRequester({ pendingCount: () => {return 1}, confirm, quit: vi.fn() });
        await expect(request()).rejects.toThrow('dialog failed');
        await expect(request()).rejects.toThrow('dialog failed');
        expect(confirm).toHaveBeenCalledTimes(2);
    });
});
