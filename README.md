# PULLWAVE — yt-dlp GUI for Linux and Windows

Pullwave is a cyberpunk-themed desktop video downloader (Electron + React + TypeScript) for Linux and Windows: a graphical frontend that wraps [yt-dlp](https://github.com/yt-dlp/yt-dlp). It also has an **anime section** built on [ani-cli](https://github.com/pystardust/ani-cli) (search, download, library and player), on Linux and on Windows 10 (version 1903) or newer.

> **Disclaimer:** every download made with this program is **at the user's own risk and responsibility**. The authors and contributors are not responsible for what is downloaded or for how it is used. You must only download content you have the right to download. See [DISCLAIMER.md](DISCLAIMER.md).

## Install
Download the file for your system from the [Releases page](https://github.com/monothread/pullwave/releases/latest). Nothing else has to be installed: yt-dlp, ffmpeg/ffprobe, deno and, for the anime section, ani-cli with the small tools it runs on are bundled.

| System | File |
|---|---|
| Windows 10/11 (64-bit) | `pullwave-x.y.z-setup.exe` |
| Ubuntu, Debian and derivatives | `pullwave-x.y.z.deb` |
| Fedora (and other RPM-based distributions) | `pullwave-x.y.z.rpm` |
| Arch Linux (and derivatives) | `pullwave-x.y.z.pacman` |
| Any other Linux | `pullwave-x.y.z.AppImage` (portable, installs nothing) |

**Windows** — run the setup file. It installs for your user only and creates the shortcuts. The installer is not code-signed, so Windows SmartScreen may show "Windows protected your PC": choose *More info* → *Run anyway*.

**Ubuntu / Debian** — double-click the `.deb` or run:
```bash
sudo apt install ./pullwave-x.y.z.deb
```

**Fedora**
```bash
sudo dnf install ./pullwave-x.y.z.rpm
```

**Arch Linux**
```bash
sudo pacman -U ./pullwave-x.y.z.pacman
```

**AppImage** — browsers drop the executable permission, so enable it first:
```bash
chmod +x pullwave-x.y.z.AppImage
./pullwave-x.y.z.AppImage
```
Or right-click the file > Properties > Permissions > "Allow executing file as program", then double-click it.
- Ubuntu 22.04 and newer need FUSE 2 to run AppImages: `sudo apt install libfuse2` (`libfuse2t64` on Ubuntu 24.04). On Fedora: `sudo dnf install fuse-libs`; on Arch: `sudo pacman -S fuse2`.
- If it does not open on Ubuntu 24.04 (restricted user namespaces), run it with `--no-sandbox`. The `.deb` does not have this problem.

Once installed, the app checks for new versions by itself (Settings > APP UPDATES).

## Requirements
- **Using the packaged app:** nothing else. yt-dlp, ffmpeg/ffprobe and deno are bundled, and so are ani-cli, BusyBox and a static curl (the anime section never uses what is installed on the system).
- **Developing:** Node.js 22+. To build the Linux packages you also need `rpm` (rpmbuild), `libarchive-tools` (bsdtar) and `zstd` (`npm run check:tools` tells you what is missing). `npm run fetch-binaries` downloads the bundled binaries into `resources/bin` (checksum-verified; `npm run dist` runs it automatically); that includes ani-cli, BusyBox and curl in `resources/bin/ani`.
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
| `npm run fetch-binaries` | Download yt-dlp, ffmpeg and deno into `resources/bin` and ani-cli + BusyBox + curl into `resources/bin/ani` (`-- --force` to refresh) |
| `npm run dist` | Linux: check the rpm/pacman tools, fetch binaries, build, and package AppImage + deb + rpm + pacman into `dist/` (never publishes) |
| `npm run dist:win` | Windows machine: same, for the NSIS installer |
| `npm run release` / `npm run release:win` | Same as `dist` / `dist:win`, then upload to a draft GitHub Release (needs `GH_TOKEN`). CI workflows do the same on GitHub; see [`docs/RELEASING.md`](docs/RELEASING.md) |

## Features
- Download queue with progress, speed, ETA, cancel, retry and history
- One field per link with an "+ ADD LINK" button; long links scroll inside the field
- Best video + best audio, max resolution, output container (mp4/mkv/webm)
- Audio-only mode (mp3/m4a/opus)
- Cookies from your browser: the browsers installed on your system (and their profiles) are detected every time the app opens, including variants such as Brave Origin; use **RESCAN BROWSERS** in Settings after installing one
- Default download folder, playlists, subtitles (including YouTube's auto-generated captions), speed limit, parallel downloads
- Embedded subtitles leave a single file: the separate subtitle files are removed once they are inside the video
- Failed or cancelled downloads clean up their `.part` files (Settings > OUTPUT); live recordings are always kept, and each card can also clear its leftovers by hand
- Settings are saved automatically as you change them
- Themes in Settings: Device (follows the system light/dark mode, default), Cyberpunk, Dark and Light
- Options for one download: each link has an **OPTIONS** button that opens a window to choose, for that download only, the video quality and container, audio only and audio format, and the live-stream settings. Whatever is not changed keeps following the Settings; a downloading card shows a *CUSTOM* badge
- Live streams (Settings > LIVE STREAMS): optionally wait for scheduled lives (the card shows a *WAITING FOR LIVE* effect) and, when a live recording stops, keep looking for the stream for a few seconds (10 by default, configurable; the card shows *VERIFYING END* with a draining bar). If the stream comes back, recording goes on in a new file of the same card
- Languages in Settings: Device (follows the system language, default), English, Português, Español, 中文 and 日本語; the whole interface, the messages and the tray menu change right away
- A FOLDER button on each link to send that download to another folder
- Optional "keep running in the system tray" (KDE, XFCE, Cinnamon, MATE, LXQt and GNOME with the AppIndicator extension); right-click the tray icon to restart or quit
- Title length limit so long titles never break the file name
- Friendly error banner with technical details on demand
- Live streams: recording time and size, **STOP & SAVE** to finish and keep the file, optional waiting for scheduled lives and recording from the start (when the source still offers it)
- **Find stream**: when yt-dlp does not understand a page, scan it (and, if needed, watch it in a hidden browser window) for the video stream and pick one to download
- Self-updating app: checks GitHub Releases, one click to download and one to restart into the new version
- Update yt-dlp from the UI (downloads the latest verified release into the app data folder)
- **Anime (Linux and Windows)**, see below

## Anime
A section for anime on top of [ani-cli](https://github.com/pystardust/ani-cli), which ships inside the app together with the small tools it needs (BusyBox and curl; BusyBox for Windows on Windows); nothing has to be installed. It needs Windows 10 version 1903 or newer on Windows.

- **Search** an anime (subtitled or dubbed), open it and see its episodes.
- **Download** episodes or a whole season. The number of downloads running or waiting is a button at the top of the section; it opens the list on a screen of its own, with BACK to return.
- **Library:** what was downloaded (kept in a local SQLite database), with sizes, where you stopped watching and what failed. Each episode is saved in a folder of its own (`<anime>/Episode N/`) with its video and all its subtitles. Search the library by title, mark an episode as watched (or not; it counts as watched from 75% too), open the folder of an anime, jump between the library and the search for the same anime (GET MORE EPISODES / VIEW IN LIBRARY). Removing an episode or an anime also deletes its files, and its folder.
- **Player** inside the app, with its own controls in the theme: play/pause, seek, volume, fullscreen (click to pause, double click for fullscreen), previous and next episode, resume where you stopped, the size of the subtitles (A- / A+) and, for downloaded episodes, a choice of subtitle.
- **Watch without downloading:** pick one episode and press WATCH.
- **Subtitles** in the language of the app (or one chosen in Settings > ANIME), when the source offers it. Every language the source offers is saved with a new download and can be chosen in the player; you can also load your own `.vtt` or `.srt` file for one episode (LOAD SUBTITLE).
- **IMPORT LIBRARY** rebuilds the library from a folder (after a new computer or a reinstall, or when you renamed or moved a folder): episodes downloaded from now on keep a small `pullwave.json` next to the video and come back exactly, as they were, with where you stopped watching; older ones are recognized by their names. An episode whose file is gone is marked in the library.
- ani-cli's version is shown at the top; **UPDATE ANI-CLI** in Settings fetches the latest one (checked before it is installed).

The episodes come from an external source that ani-cli reads; it can change or block requests at any time, and updating ani-cli is often what fixes it. Some antivirus programs distrust small unsigned tools such as BusyBox or curl; they are the official builds, pinned by checksum (see `resources/THIRD_PARTY_NOTICES.md`). The same disclaimer applies: see [DISCLAIMER.md](DISCLAIMER.md). Some codecs may not play inside the app.

## Find stream
When a download fails because yt-dlp does not understand the page (for example "Unsupported URL"), the job card shows **FIND STREAM**. The app first scans the page's HTML, then, if nothing is found, loads the page in a hidden, sandboxed browser window for up to 25 seconds and watches which video playlists/files it requests. You choose one of the streams found and it is downloaded like any other link (with the page as referer).

- It does **not** bypass DRM: protected streams (Widevine, FairPlay...) cannot be downloaded, and pages that need a login or an action the app cannot perform may show nothing.
- The hidden window contacts the site like any browser would, so the site sees a visit from you. Nothing from it is kept after the search.
- Use it only for content you have the right to download. You are solely responsible for what you download; see [DISCLAIMER.md](DISCLAIMER.md).

## Notes
- **System tray:** on Linux the tray uses the StatusNotifierItem/AppIndicator standard (KDE, XFCE, Cinnamon, MATE, LXQt and GNOME with an extension); on Windows it is the notification area. Stock GNOME has no tray: install the "AppIndicator and KStatusNotifierItem Support" extension (Ubuntu ships it enabled; Fedora: `sudo dnf install gnome-shell-extension-appindicator`; Arch: `sudo pacman -S gnome-shell-extension-appindicator`, then enable it). Without one, the option is ignored and closing the window quits the app.
- **Windows cookies:** exporting cookies from Chrome/Edge (`--cookies-from-browser`) can fail on Windows because of the browsers' newer cookie encryption; Firefox is more reliable.
- If Electron refuses to start because of the Chromium sandbox on your distro (restricted user namespaces), run it with `--no-sandbox`.
- Third-party software bundled in the package is listed in [`resources/THIRD_PARTY_NOTICES.md`](resources/THIRD_PARTY_NOTICES.md).

Developer docs live in [`docs/`](docs/README.md).

## Screenshots
| Cyberpunk | Dark | Light |
|---|---|---|
| ![Cyberpunk theme](docs/screenshots/cyberpunk-downloads.png) | ![Dark theme](docs/screenshots/dark-downloads.png) | ![Light theme](docs/screenshots/light-downloads.png) |
