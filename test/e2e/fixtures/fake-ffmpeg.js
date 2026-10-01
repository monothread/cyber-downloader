#!/usr/bin/env node
// A stand-in for ffmpeg's concat demuxer: joins the files listed in the `-i` list into the last argument.
const fs = require('node:fs');

// Joining takes a moment, as it does with real recordings, so the "joining parts" state of the card can be seen.
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500);

const args = process.argv.slice(2);
const listPath = args[args.indexOf('-i') + 1];
const outputPath = args.at(-1);
const files = fs
    .readFileSync(listPath, 'utf-8')
    .split('\n')
    .map((line) => {
        return line.replace(/^file '/, '').replace(/'$/, '').replaceAll("'\\''", "'");
    });
fs.writeFileSync(
    outputPath,
    Buffer.concat(
        files.map((file) => {
            return fs.readFileSync(file);
        })
    )
);
