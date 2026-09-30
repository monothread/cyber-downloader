# CYBER//DL

Cyberpunk-themed Linux desktop app (Electron + React + TypeScript) that wraps [yt-dlp](https://github.com/yt-dlp/yt-dlp).

## Install
Download the latest file from the [Releases page](https://github.com/monothread/cyber-downloader/releases/latest). Nothing else has to be installed: yt-dlp, ffmpeg/ffprobe and deno are bundled.

| File | Best for |
|---|---|
| `cyber-downloader-x.y.z.deb` | Ubuntu, Debian and derivatives |
| `cyber-downloader-x.y.z.AppImage` | Any other Linux distribution (portable, installs nothing) |

**`.deb`** — double-click it to open your software installer, or run:
```bash
sudo apt install ./cyber-downloader-x.y.z.deb
```
Then open **Cyber Downloader** from your applications menu.

**AppImage** — browsers drop the executable permission, so enable it first:
```bash
chmod +x cyber-downloader-x.y.z.AppImage
./cyber-downloader-x.y.z.AppImage
```
Or right-click the file > Properties > Permissions > "Allow executing file as program", then double-click it.
- Ubuntu 22.04 and newer need FUSE 2 to run AppImages: `sudo apt install libfuse2` (`libfuse2t64` on Ubuntu 24.04).
- If it does not open on Ubuntu 24.04 (restricted user namespaces), run it with `--no-sandbox`. The `.deb` does not have this problem.

Once installed, the app checks for new versions by itself (Settings > APP UPDATES).

## Requirements
- **Using the packaged app:** nothing else. yt-dlp, ffmpeg/ffprobe and deno are bundled.
- **Developing:** Node.js 22+. `npm run fetch-binaries` downloads the bundled binaries into `resources/bin` (checksum-verified; `npm run dist` runs it automatically).
- You can still point to your own yt-dlp/ffmpeg in **Settings > Advanced**.

## Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Start the app in development mode |
| `npm run build` | Build main, preload and renderer into `out/` |
| `npm test` | Unit tests (Vitest) |
| `npm run test:e2e` | Build + end-to-end tests (Playwright driving the real Electron app with a fake yt-dlp) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (zero warnings allowed) |
| `npm run fetch-binaries` | Download yt-dlp, ffmpeg and deno into `resources/bin` (`-- --force` to refresh) |
| `npm run dist` | Fetch binaries, build, and package AppImage + deb into `dist/` (never publishes) |
| `npm run release` | Same as `dist`, then uploads a draft GitHub Release (needs `GH_TOKEN`); see [`docs/RELEASING.md`](docs/RELEASING.md) |

## Features
- Download queue with progress, speed, ETA, cancel, retry and history
- One field per link with an "+ ADD LINK" button; long links scroll inside the field
- Best video + best audio, max resolution, output container (mp4/mkv/webm)
- Audio-only mode (mp3/m4a/opus)
- Cookies from your browser (chrome, firefox, brave, chromium, edge, opera, vivaldi)
- Default download folder, playlists, subtitles, speed limit, parallel downloads
- Settings are saved automatically as you change them
- Title length limit so long titles never break the file name
- Friendly error banner with technical details on demand
- Self-updating app: checks GitHub Releases, one click to download and one to restart into the new version
- Update yt-dlp from the UI (downloads the latest verified release into the app data folder)

## Notes
- If Electron refuses to start because of the Chromium sandbox on your distro (restricted user namespaces), run it with `--no-sandbox`.
- Third-party software bundled in the package is listed in [`resources/THIRD_PARTY_NOTICES.md`](resources/THIRD_PARTY_NOTICES.md).

Developer docs live in [`docs/`](docs/README.md).
