# Architecture

## Folder structure
```
src/
  shared/        types.ts (Settings, DownloadJob, JobStatus, HistoryEntry, AppUpdateState, CyberApi, ...), constants.ts (IPC channels, defaults), url.ts (isValidHttpUrl)
  main/
    index.ts                    # window, lifecycle, wiring
    ipc/registerHandlers.ts     # typed IPC channels
    services/
      binaryResolver.ts         # where each binary lives (custom > updated > bundled > system)
      binaryLocator.ts          # version probe of the resolved binaries
      ytdlpArgsBuilder.ts       # Settings + URL -> string[] (pure function)
      ytdlpRunner.ts            # spawn, progress, cancellation
      progressParser.ts         # parses the --progress-template output
      errorMapper.ts            # stderr -> { code, title, hint, raw }
      queueManager.ts           # queue + concurrency
      jsonStore.ts / settingsSanitizer.ts / settingsStore.ts / historyStore.ts
      updater.ts                # updates yt-dlp (verified download into userData/bin)
      appUpdateService.ts       # app self-update state machine (electron-updater)
      electronUpdater.ts        # thin adapter around electron-updater's autoUpdater
      trayAvailability.ts       # is a system tray available? (SNI watcher on the session bus + desktop heuristic)
      trayManager.ts            # creates/destroys the tray according to the closeToTray setting
      windowClose.ts            # close action (allow / hide / ask-quit) and the quit confirmation flow
      electronTray.ts           # thin adapter around Electron's Tray + Menu
      mediaKinds.ts             # media type from URL / Content-Type, segment and private-host detection
      pageScanner.ts            # static scan of a page's HTML (and iframes) for video addresses
      sniffRules.ts             # which network requests/responses count as media (pure)
      browserSniffer.ts         # hidden, sandboxed BrowserWindow that watches the page's network
      playlistFilter.ts         # drops HLS quality variants covered by a master playlist
      streamGrouping.ts         # folds near-identical addresses of one video (mirrors/redirects) into one candidate
      streamFinder.ts           # static scan -> hidden browser; keeps candidates' request details in the main process
  preload/index.ts              # contextBridge with a typed API
  renderer/
    App.tsx, theme/cyberpunk.css
    components/ UrlInput, QueueList, JobCard, SettingsPanel, HistoryList, ErrorBanner, BinaryStatus,
                Toast, UpdateBanner, UpdateActions, StreamFinder, fields
    hooks/ useAutoSaveSettings (debounced settings auto-save)
    store/ (zustand)
test/            # unit tests mirroring src
test/e2e/        # Playwright-Electron (fake yt-dlp via stub)
scripts/         # fetch-binaries.mjs (per platform), check-linux-tools.mjs (rpm/pacman prerequisites)
.github/workflows/  # release-linux.yml, release-windows.yml (manual, build and attach packages to the draft Release)
resources/       # icon.png, THIRD_PARTY_NOTICES.md, bin/ (git-ignored)
docs/
```

## Flow
Renderer (React) → `window.api` (preload, typed) → IPC → `registerHandlers` → `queueManager` → `ytdlpRunner` (spawn) → progress/error/finish events → IPC push → Zustand store → UI.

Closing the window: `decideCloseAction` → `hide` (tray available and `closeToTray` on), `ask-quit` (ask when downloads are pending, then `app.quit()`) or `allow` (already quitting). The app is single-instance; a second launch shows the window.

On `before-quit` the main process calls `queue.shutdown()`: every running yt-dlp is sent SIGTERM and no queued job is started, so no download (or ffmpeg merge) is left running in the background after the app closes.

## Stream finder
Failed job (`UNKNOWN`/`OUTDATED`) → **FIND STREAM** → `stream:find` (main: `StreamFinder.find`) → stage events (`event:stream-progress`: scanning → watching) → candidate list in the job card → **DOWNLOAD** → `stream:download` → `QueueManager.add(url, { referer, userAgent, cookie, title })` → the usual `ytdlpRunner` flow. Request details (referer, cookies) never reach the renderer. See D-019.

## Feature → yt-dlp args (`ytdlpArgsBuilder`)
| Feature | Args |
|---|---|
| Default folder | `-P <dir>` (fallback `~/Downloads`) |
| Browser cookies | `--cookies-from-browser <browser>[:profile]` (optional, off by default) |
| Best audio + video | `-f "bv*+ba/b"`; capped: `bv*[height<=N]+ba/b[height<=N]` |
| Output format | `--merge-output-format mp4\|mkv\|webm` |
| Audio only | `-x --audio-format mp3\|m4a\|opus` |
| Title length | `-o "%(title).{N}s [%(id)s].%(ext)s" --trim-filenames 240` |
| Playlist | `--yes-playlist` / `--no-playlist` |
| Subtitles | `--write-subs --sub-langs <..> [--embed-subs]` |
| Progress | `--newline --progress-template "download:CYBERPROG\|%(progress._percent_str)s\|..."` plus `--print after_move:CYBERFILE\|%(filepath)s` |
| Extras | rate limit, concurrency, custom paths, JS runtime, extra args |
| Stream found on a page | `--referer <page>`, `--user-agent <UA used to find it>`, `--add-header Cookie:<cookies seen>`, `--force-ipv4/--force-ipv6` when the address is bound to an IP, file named from the page title |

## Theme
Neon cyan/magenta/yellow on a dark background, mono font, scanlines, glitch on titles, glowing borders. Errors in neon red.

## Tests
- Unit: `test/main/**`, `test/renderer/**`, `test/shared/**`; helpers in `test/helpers/` (`mockApi.ts`, `fakeChild.ts`, `tempDir.ts`).
- e2e: `test/e2e/app.e2e-spec.ts` launches the real Electron app (run `npm run build` first) with a temporary `--user-data-dir` and `FAKE_YTDLP_LOG` to record the fake yt-dlp's argv and `PATH`.

## Bundled binaries
`scripts/fetch-binaries.mjs [--platform=linux|win32] [--out=<dir>] [--force]` → `resources/bin/` (git-ignored): `yt-dlp`, `ffmpeg`, `ffprobe`, `deno`, `ffmpeg-GPLv3.txt` on Linux (plus `resources/lib/` with ffmpeg's shared libraries, see D-024), and the same with `.exe` on Windows (no `lib/`). Every download is checked against the checksum its source publishes. In dev the app uses `<appPath>/resources/bin`; packaged, `process.resourcesPath/bin`. See D-013.

## Platforms
| OS | Package | Built by | Auto-update |
|---|---|---|---|
| Ubuntu/Debian and derivatives | `.deb` | `npm run release` locally or the "Release Linux" workflow | yes (package manager, asks for a password) |
| Fedora | `.rpm` | same as above | yes (same mechanism) |
| Arch Linux | `.pacman` | same as above | yes (same mechanism) |
| Any Linux | `.AppImage` | same as above | yes (replaces its own file) |
| Windows 10/11 x64 | NSIS `…-setup.exe` (per-user, one click) | the "Release Windows" workflow (`npm run release:win` on a Windows machine) | yes (electron-updater, `latest.yml`) |

Platform differences live in small, injectable spots: `executableName`/`spawnEnv` in `binaryResolver.ts` (`.exe`, `Path` key), the yt-dlp asset name in `updater.ts`, and `checkTraySupport` (the D-Bus check only runs on Linux).
