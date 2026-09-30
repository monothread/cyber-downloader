#!/usr/bin/env node
const fs = require('node:fs');

const args = process.argv.slice(2);
const logPath = process.env.FAKE_YTDLP_LOG;
if (logPath) {
    fs.appendFileSync(logPath, `${JSON.stringify(args)}\n`);
    fs.writeFileSync(`${logPath}.env`, process.env.PATH ?? '');
}

if (args.includes('--version')) {
    process.stdout.write('fake-1.0\n');
    process.exit(0);
}
if (args.includes('-U')) {
    process.stdout.write('Fake yt-dlp is up to date\n');
    process.exit(0);
}

const url = args[args.length - 1];
const downloadDir = args[args.indexOf('-P') + 1];
const title = 'Fake Video';

function progress(percent) {
    process.stdout.write(`CYBERPROG|${percent.toFixed(1).padStart(6)}%|1.00MiB/s|00:01|${title}\n`);
}

if (url.includes('unsupported')) {
    process.stderr.write(`ERROR: Unsupported URL: ${url}\n`);
    process.exit(1);
}

if (url.includes('fail')) {
    process.stderr.write('ERROR: [youtube] abc: Video unavailable\n');
    process.exit(1);
}

progress(10);
if (url.includes('quiet')) {
    // Stays alive without writing anything, so it never notices that its parent is gone.
    setInterval(() => {}, 1000);
} else if (url.includes('slow')) {
    setInterval(() => {
        progress(50);
    }, 200);
} else {
    progress(60);
    progress(100);
    process.stdout.write(`CYBERFILE|${downloadDir}/${title} [abc].mp4\n`);
    process.exit(0);
}
