import {
    listRegisteredBrowsers,
    parseDesktopEntry,
    parseRegistrySubKeys,
    parseRegistryValue,
    productFolderOfCommand,
    programOfExec,
    type RegistryReader
} from '@main/services/browserRegistry';

const BROWSER_ENTRY = [
    '[Desktop Entry]',
    'Name=Brave Origin',
    'Name[pt_BR]=Brave Origem',
    'Exec=/usr/bin/brave-origin-stable %U',
    'MimeType=text/html;x-scheme-handler/http;x-scheme-handler/https;',
    '',
    '[Desktop Action new-window]',
    'Name=New Window',
    'Exec=/usr/bin/brave-origin-stable'
].join('\n');

describe('parseDesktopEntry', () => {
    it('reads the unlocalized name, the command and the mime types of the main group only', () => {
        expect(parseDesktopEntry(BROWSER_ENTRY)).toEqual({
            name: 'Brave Origin',
            exec: '/usr/bin/brave-origin-stable %U',
            mimeTypes: ['text/html', 'x-scheme-handler/http', 'x-scheme-handler/https', '']
        });
    });

    it.each([
        ['without a name', '[Desktop Entry]\nExec=firefox'],
        ['without a command', '[Desktop Entry]\nName=Firefox'],
        ['hidden from menus', '[Desktop Entry]\nName=A\nExec=a\nNoDisplay=true'],
        ['removed', '[Desktop Entry]\nName=A\nExec=a\nHidden=true']
    ])('ignores an entry %s', (_case, text) => {
        expect(parseDesktopEntry(text)).toBeNull();
    });

    it('has no mime types when the entry declares none', () => {
        expect(parseDesktopEntry('[Desktop Entry]\r\nName=A\r\nExec=a')?.mimeTypes).toEqual(['']);
    });
});

describe('programOfExec', () => {
    it.each([
        ['/usr/bin/brave-origin-stable %U', 'brave-origin-stable'],
        ['firefox %u', 'firefox'],
        ['"/opt/Some Browser/browser" --flag', 'browser'],
        ['env BAMF_DESKTOP_FILE_HINT=/x chromium %U', 'chromium']
    ])('finds the program of "%s"', (exec, program) => {
        expect(programOfExec(exec)).toBe(program);
    });

    it.each(['flatpak run com.brave.Browser', 'snap run firefox', 'sh -c "firefox"', '%U', ''])('gives no program for the launcher line "%s"', (exec) => {
        expect(programOfExec(exec)).toBeNull();
    });
});

describe('parseRegistryValue', () => {
    it('reads the value whatever the localized name of the default value is', () => {
        expect(parseRegistryValue('\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Clients\\StartMenuInternet\\Google Chrome\r\n    (Padrão)    REG_SZ    Google Chrome\r\n')).toBe('Google Chrome');
    });

    it('returns null when the value is not set', () => {
        expect(parseRegistryValue('    (value not set)')).toBeNull();
    });
});

describe('parseRegistrySubKeys', () => {
    it('lists the keys right under the parent, whatever the letter case', () => {
        const output = [
            '',
            'HKEY_LOCAL_MACHINE\\SOFTWARE\\Clients\\StartMenuInternet',
            'HKEY_LOCAL_MACHINE\\SOFTWARE\\Clients\\StartMenuInternet\\Google Chrome',
            'hkey_local_machine\\software\\clients\\startmenuinternet\\Brave',
            ''
        ].join('\r\n');
        expect(parseRegistrySubKeys(output, 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Clients\\StartMenuInternet')).toEqual([
            'HKEY_LOCAL_MACHINE\\SOFTWARE\\Clients\\StartMenuInternet\\Google Chrome',
            'hkey_local_machine\\software\\clients\\startmenuinternet\\Brave'
        ]);
    });
});

describe('productFolderOfCommand', () => {
    it.each([
        ['"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"', 'Chrome'],
        ['"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" --flag', 'Edge'],
        ['C:\\Apps\\Vivaldi\\vivaldi.exe', 'Vivaldi']
    ])('finds the product folder in %s', (command, folder) => {
        expect(productFolderOfCommand(command)).toBe(folder);
    });

    it('gives nothing when the command has no executable', () => {
        expect(productFolderOfCommand('rundll32 something')).toBeNull();
    });
});

describe('listRegisteredBrowsers on Linux', () => {
    function reader(files: Record<string, Record<string, string>>): RegistryReader {
        return {
            listFiles: async (dir) => {
                return Object.keys(files[dir] ?? {});
            },
            readText: async (path) => {
                const dir = path.slice(0, path.lastIndexOf('/'));
                return files[dir]?.[path.slice(path.lastIndexOf('/') + 1)] ?? null;
            },
            exec: vi.fn(async () => {
                return '';
            })
        };
    }
    const SOURCES = { platform: 'linux' as const, homeDir: '/home/a', env: {} };

    it('lists the entries that handle http links, in the standard XDG folders', async () => {
        const files = {
            '/usr/share/applications': {
                'brave-origin.desktop': BROWSER_ENTRY,
                'editor.desktop': '[Desktop Entry]\nName=Editor\nExec=editor\nMimeType=text/plain;',
                'notes.txt': 'not a desktop file'
            },
            '/home/a/.local/share/applications': {
                'firefox.desktop': '[Desktop Entry]\nName=Firefox Web Browser\nExec=firefox %u\nMimeType=x-scheme-handler/http;'
            }
        };
        await expect(listRegisteredBrowsers(SOURCES, reader(files))).resolves.toEqual([
            { name: 'Firefox Web Browser', key: 'firefox' },
            { name: 'Brave Origin', key: 'brave-origin-stable' }
        ]);
    });

    it('honours XDG_DATA_HOME and XDG_DATA_DIRS', async () => {
        const files = {
            '/data/home/applications': { 'a.desktop': '[Desktop Entry]\nName=A\nExec=a-browser\nMimeType=x-scheme-handler/http;' },
            '/data/one/applications': { 'b.desktop': '[Desktop Entry]\nName=B\nExec=b-browser\nMimeType=x-scheme-handler/http;' }
        };
        const sources = { ...SOURCES, env: { XDG_DATA_HOME: '/data/home', XDG_DATA_DIRS: '/data/one:' } };
        await expect(listRegisteredBrowsers(sources, reader(files))).resolves.toEqual([
            { name: 'A', key: 'a-browser' },
            { name: 'B', key: 'b-browser' }
        ]);
    });

    it('reads only the given folders when they are overridden', async () => {
        const files = {
            '/usr/share/applications': { 'brave-origin.desktop': BROWSER_ENTRY },
            '/fake/apps': { 'x.desktop': '[Desktop Entry]\nName=X\nExec=x\nMimeType=x-scheme-handler/http;' }
        };
        await expect(listRegisteredBrowsers({ ...SOURCES, applicationDirs: ['/fake/apps'] }, reader(files))).resolves.toEqual([{ name: 'X', key: 'x' }]);
    });

    it('skips entries launched through flatpak, which cannot be matched to a folder', async () => {
        const files = {
            '/usr/share/applications': {
                'brave.desktop': '[Desktop Entry]\nName=Brave\nExec=flatpak run com.brave.Browser\nMimeType=x-scheme-handler/http;'
            }
        };
        await expect(listRegisteredBrowsers(SOURCES, reader(files))).resolves.toEqual([]);
    });

    it('returns nothing when reading fails', async () => {
        const failing: RegistryReader = {
            listFiles: async () => {
                throw new Error('denied');
            },
            readText: async () => {
                return null;
            },
            exec: vi.fn()
        };
        await expect(listRegisteredBrowsers(SOURCES, failing)).resolves.toEqual([]);
    });

    it('returns nothing on systems it does not know', async () => {
        await expect(listRegisteredBrowsers({ ...SOURCES, platform: 'darwin' }, reader({}))).resolves.toEqual([]);
    });
});

describe('listRegisteredBrowsers on Windows', () => {
    const SOURCES = { platform: 'win32' as const, homeDir: 'C:\\Users\\a', env: {} };
    const CHROME_KEY = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Clients\\StartMenuInternet\\Google Chrome';

    function registry(calls: string[][]): RegistryReader {
        return {
            listFiles: vi.fn(),
            readText: vi.fn(),
            exec: vi.fn(async (_file: string, args: string[]) => {
                calls.push(args);
                const key = args[1] ?? '';
                if (key === 'HKLM\\SOFTWARE\\Clients\\StartMenuInternet') {
                    return `\r\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Clients\\StartMenuInternet\r\n${CHROME_KEY}\r\n`;
                }
                if (key === CHROME_KEY) {
                    return `${CHROME_KEY}\r\n    (Default)    REG_SZ    Google Chrome\r\n`;
                }
                if (key === `${CHROME_KEY}\\shell\\open\\command`) {
                    return '    (Default)    REG_SZ    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"\r\n';
                }
                throw new Error('The system was unable to find the specified registry key');
            })
        };
    }

    it('reads the browsers registered under StartMenuInternet', async () => {
        const calls: string[][] = [];
        await expect(listRegisteredBrowsers(SOURCES, registry(calls))).resolves.toEqual([{ name: 'Google Chrome', key: 'Chrome' }]);
        expect(calls).toEqual([
            ['query', 'HKLM\\SOFTWARE\\Clients\\StartMenuInternet'],
            ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Clients\\StartMenuInternet'],
            ['query', 'HKCU\\SOFTWARE\\Clients\\StartMenuInternet'],
            ['query', CHROME_KEY, '/ve'],
            ['query', `${CHROME_KEY}\\shell\\open\\command`, '/ve']
        ]);
    });

    it('skips a key whose command cannot be read', async () => {
        const reader = registry([]);
        reader.exec = vi.fn(async (_file: string, args: string[]) => {
            if (args[1] === 'HKLM\\SOFTWARE\\Clients\\StartMenuInternet') {
                return `${CHROME_KEY}\r\n`;
            }
            if (args[1] === CHROME_KEY) {
                return '    (Default)    REG_SZ    Google Chrome\r\n';
            }
            throw new Error('missing');
        });
        await expect(listRegisteredBrowsers(SOURCES, reader)).resolves.toEqual([]);
    });
});
