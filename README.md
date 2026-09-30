# CYBER//DL

Cyberpunk-themed desktop app (Electron + React + TypeScript) for Linux and Windows that wraps [yt-dlp](https://github.com/yt-dlp/yt-dlp).

> **Disclaimer:** every download made with this program is **at the user's own risk and responsibility**. The authors and contributors are not responsible for what is downloaded or for how it is used. You must only download content you have the right to download. See [DISCLAIMER.md](DISCLAIMER.md).

## Install
Download the file for your system from the [Releases page](https://github.com/monothread/cyber-downloader/releases/latest). Nothing else has to be installed: yt-dlp, ffmpeg/ffprobe and deno are bundled.

| System | File |
|---|---|
| Windows 10/11 (64-bit) | `cyber-downloader-x.y.z-setup.exe` |
| Ubuntu, Debian and derivatives | `cyber-downloader-x.y.z.deb` |
| Fedora (and other RPM-based distributions) | `cyber-downloader-x.y.z.rpm` |
| Arch Linux (and derivatives) | `cyber-downloader-x.y.z.pacman` |
| Any other Linux | `cyber-downloader-x.y.z.AppImage` (portable, installs nothing) |

**Windows** — run the setup file. It installs for your user only and creates the shortcuts. The installer is not code-signed, so Windows SmartScreen may show "Windows protected your PC": choose *More info* → *Run anyway*.

**Ubuntu / Debian** — double-click the `.deb` or run:
```bash
sudo apt install ./cyber-downloader-x.y.z.deb
```

**Fedora**
```bash
sudo dnf install ./cyber-downloader-x.y.z.rpm
```

**Arch Linux**
```bash
sudo pacman -U ./cyber-downloader-x.y.z.pacman
```

**AppImage** — browsers drop the executable permission, so enable it first:
```bash
chmod +x cyber-downloader-x.y.z.AppImage
./cyber-downloader-x.y.z.AppImage
```
Or right-click the file > Properties > Permissions > "Allow executing file as program", then double-click it.
- Ubuntu 22.04 and newer need FUSE 2 to run AppImages: `sudo apt install libfuse2` (`libfuse2t64` on Ubuntu 24.04). On Fedora: `sudo dnf install fuse-libs`; on Arch: `sudo pacman -S fuse2`.
- If it does not open on Ubuntu 24.04 (restricted user namespaces), run it with `--no-sandbox`. The `.deb` does not have this problem.

Once installed, the app checks for new versions by itself (Settings > APP UPDATES).

## Requirements
- **Using the packaged app:** nothing else. yt-dlp, ffmpeg/ffprobe and deno are bundled.
- **Developing:** Node.js 22+. To build the Linux packages you also need `rpm` (rpmbuild), `libarchive-tools` (bsdtar) and `zstd` (`npm run check:tools` tells you what is missing). `npm run fetch-binaries` downloads the bundled binaries into `resources/bin` (checksum-verified; `npm run dist` runs it automatically).
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
| `npm run dist` | Linux: check the rpm/pacman tools, fetch binaries, build, and package AppImage + deb + rpm + pacman into `dist/` (never publishes) |
| `npm run dist:win` | Windows machine: same, for the NSIS installer |
| `npm run release` / `npm run release:win` | Same as `dist` / `dist:win`, then upload to a draft GitHub Release (needs `GH_TOKEN`). CI workflows do the same on GitHub; see [`docs/RELEASING.md`](docs/RELEASING.md) |

## Features
- Download queue with progress, speed, ETA, cancel, retry and history
- One field per link with an "+ ADD LINK" button; long links scroll inside the field
- Best video + best audio, max resolution, output container (mp4/mkv/webm)
- Audio-only mode (mp3/m4a/opus)
- Cookies from your browser (chrome, firefox, brave, chromium, edge, opera, vivaldi)
- Default download folder, playlists, subtitles, speed limit, parallel downloads
- Settings are saved automatically as you change them
- Optional "keep running in the system tray" (KDE, XFCE, Cinnamon, MATE, LXQt and GNOME with the AppIndicator extension); right-click the tray icon to quit
- Title length limit so long titles never break the file name
- Friendly error banner with technical details on demand
- **Find stream**: when yt-dlp does not understand a page, scan it (and, if needed, watch it in a hidden browser window) for the video stream and pick one to download
- Self-updating app: checks GitHub Releases, one click to download and one to restart into the new version
- Update yt-dlp from the UI (downloads the latest verified release into the app data folder)

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
