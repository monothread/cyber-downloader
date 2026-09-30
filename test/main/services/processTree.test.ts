import { killProcessTree } from '@main/services/processTree';

describe('killProcessTree', () => {
    it('ends the whole process tree with taskkill on Windows', () => {
        const kill = vi.fn();
        const taskkill = vi.fn();
        killProcessTree({ pid: 4321, kill }, 'win32', taskkill);
        expect(taskkill).toHaveBeenCalledTimes(1);
        expect(taskkill).toHaveBeenCalledWith('taskkill', ['/PID', '4321', '/T', '/F']);
        expect(kill).not.toHaveBeenCalled();
    });

    it('falls back to a plain kill on Windows when the process has no pid', () => {
        const kill = vi.fn();
        const taskkill = vi.fn();
        killProcessTree({ kill }, 'win32', taskkill);
        expect(taskkill).not.toHaveBeenCalled();
        expect(kill).toHaveBeenCalledWith('SIGTERM');
    });

    it.each<NodeJS.Platform>(['linux', 'darwin'])('sends SIGTERM to the process on %s', (platform) => {
        const kill = vi.fn();
        const taskkill = vi.fn();
        killProcessTree({ pid: 99, kill }, platform, taskkill);
        expect(kill).toHaveBeenCalledTimes(1);
        expect(kill).toHaveBeenCalledWith('SIGTERM');
        expect(taskkill).not.toHaveBeenCalled();
    });

    it('does not fail when taskkill cannot be started (default spawn)', () => {
        expect(() => {
            killProcessTree({ pid: 2147483646, kill: vi.fn() }, 'win32');
        }).not.toThrow();
    });
});
