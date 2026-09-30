#!/usr/bin/env node
// The rpm (Fedora) and pacman (Arch) packages are produced by fpm, which shells out to a few system tools.
// Checking them up front gives a clear message instead of a failure halfway through the build.
import { execFileSync } from 'node:child_process';

const REQUIRED = [
    { command: 'rpmbuild', apt: 'rpm', dnf: 'rpm-build', pacman: 'rpm-tools' },
    { command: 'bsdtar', apt: 'libarchive-tools', dnf: 'bsdtar', pacman: 'libarchive' },
    { command: 'zstd', apt: 'zstd', dnf: 'zstd', pacman: 'zstd' }
];

function isInstalled(command) {
    try {
        execFileSync('sh', ['-c', `command -v ${command}`], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

if (process.platform !== 'linux') {
    process.exit(0);
}

const missing = REQUIRED.filter((tool) => {
    return !isInstalled(tool.command);
});

if (missing.length > 0) {
    const names = (key) => {
        return missing.map((tool) => {
            return tool[key];
        }).join(' ');
    };
    console.error(`Missing tools needed to build the rpm and pacman packages: ${missing.map((tool) => {
        return tool.command;
    }).join(', ')}`);
    console.error('Install them, then run the command again:');
    console.error(`  Debian/Ubuntu: sudo apt install ${names('apt')}`);
    console.error(`  Fedora:        sudo dnf install ${names('dnf')}`);
    console.error(`  Arch:          sudo pacman -S ${names('pacman')}`);
    process.exit(1);
}
