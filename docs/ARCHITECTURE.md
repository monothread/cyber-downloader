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
      # Anime section (Linux and Windows, D-036 to D-039)
      aniCliLocator.ts          # which ani-cli/busybox/curl, tool links, isolated env, patched copy of the script
      aniCliRunner.ts           # spawn `busybox sh ani-cli ...`, menu choices, progress, cancel
      aniCliService.ts          # search, episodes, download, resolveStream on top of the runner
      aniArgsBuilder.ts / aniOutputParser.ts   # validated arguments; parse the menu, progress and errors
      aniSubtitles.ts / aniStream.ts / aniPatches.ts   # run-time patches of ani-cli (subtitle language, referer in debug output)
      aniCliUpdater.ts / aniVersion.ts         # update ani-cli from its repository, versions
      animeDb.ts                # node:sqlite library (anime, episode, progress), migrations by user_version
      animeDownloadQueue.ts     # one job per episode, concurrency, progress, retry
      animeFiles.ts             # file/folder names, what is removed with an anime
      mediaProtocol.ts          # pullwave-media:// (downloaded files, byte ranges)
      streamProxy.ts            # pullwave-stream:// (HLS streams fetched with the referer, playlists rewritten)
    animeRuntime.ts             # wires the anime services (null where the section does not exist)
    ipc/registerAnimeHandlers.ts  # anime:* channels (answers "unsupported" where the section does not exist)
  preload/index.ts              # contextBridge with a typed API
  renderer/
    App.tsx, theme/cyberpunk.css
    i18n/ language (system locale), useTranslator (React hook)
    components/ UrlInput, QueueList, JobCard, SettingsPanel, HistoryList, ErrorBanner, BinaryStatus,
                Toast, UpdateBanner, UpdateActions, StreamFinder, fields,
                AnimePanel, AnimeSearch, AnimeDetail, AnimeJobs, AnimeLibrary, AnimePlayer, AnimeStreamPlayer, AnimeRemove
    hooks/ useAutoSaveSettings (debounced settings auto-save)
    store/ (zustand): appStore.ts, animeStore.ts
test/            # unit tests mirroring src
test/e2e/        # Playwright-Electron (fake yt-dlp via stub)
scripts/         # fetch-binaries.mjs (per platform), check-linux-tools.mjs (rpm/pacman prerequisites)
.github/workflows/  # release-linux.yml, release-windows.yml (manual, build and attach packages to the draft Release)
resources/       # icon.png, THIRD_PARTY_NOTICES.md, ani-scripts/pullwave-run.sh (runs ani-cli with a menu, a player and tput defined as functions), bin/ (git-ignored)
docs/
```

## Flow
Renderer (React) → `window.api` (preload, typed) → IPC → `registerHandlers` → `queueManager` → `ytdlpRunner` (spawn) → progress/error/finish events → IPC push → Zustand store → UI.

Closing the window: `decideCloseAction` → `hide` (tray available and `closeToTray` on), `ask-quit` (ask when downloads are pending, then `app.quit()`) or `allow` (already quitting). The app is single-instance; a second launch shows the window.

On `before-quit` the main process calls `queue.shutdown()`: every running yt-dlp is sent SIGTERM and no queued job is started, so no download (or ffmpeg merge) is left running in the background after the app closes.

## Stream finder
Failed job (`UNKNOWN`/`OUTDATED`) → **FIND STREAM** → `stream:find` (main: `StreamFinder.find`) → stage events (`event:stream-progress`: scanning → watching) → candidate list in the job card → **DOWNLOAD** → `stream:download` → `QueueManager.add(url, { referer, userAgent, cookie, title })` → the usual `ytdlpRunner` flow. Request details (referer, cookies) never reach the renderer. See D-019.

## Anime section (Linux and Windows)
Same shape as the rest: renderer (`animeStore`, `Anime*` components) → `window.api` → `anime:*` IPC (`registerAnimeHandlers`) → `AniCliService` → `aniCliRunner` → `busybox sh pullwave-run.sh ani-cli …` with an isolated environment: on Linux a `PATH` of links to the busybox applets, curl, yt-dlp and ffmpeg made in `userData/anime/tools`; on Windows no links (BusyBox for Windows runs its applets itself) and a `Path` of the bundled folders plus the folders of the chosen yt-dlp and ffmpeg, with only the system variables Windows programs need passed on (`SystemRoot`, `TEMP`, `USERPROFILE`...), and the paths given to the shell with forward slashes. ani-cli has no structured output, so searching and listing work by handing it `pullwave_menu` as its menu program (a function defined by `pullwave-run.sh`, like the stand-in player and `tput`), which reports every choice on stderr; a choice is later picked with `-S <position>` and `-e <episode>`. See D-036.

- **Data:** `userData/anime/anime.db` (`node:sqlite`, migrations by `PRAGMA user_version`); the queue itself is in memory, so at start unfinished episodes become errors that can be retried.
- **Downloads:** `AnimeDownloadQueue` runs one job per episode (a season is all its episodes) up to `maxConcurrent`; events `event:anime-job` and `event:anime-library` push changes to the store.
- **Player:** `<video>` reads `pullwave-media://episode/<id>` and `.../subtitle/<id>`, served by `mediaProtocol.ts` with byte ranges. **Watch without downloading:** `anime:stream-open` runs ani-cli with the `debug` player (it prints the address), `StreamSessions` opens a session and hls.js in the renderer plays `pullwave-stream://p/<session>/<address>`, which the main process fetches with the right referer, rewriting playlists. Both schemes are registered as privileged before the app is ready; the CSP allows them (and `blob:` for hls.js). See D-036/D-037.
- **Patches:** ani-cli is pinned and checked by hash; `AniCliLocator.withPatches` runs a patched copy (subtitle language, referer in the debug output) and falls back to the original when its lines do not match (D-037). The script can be updated from the settings (D-038).
- **Where it exists:** `isAnimeSupported(platform)` (Linux and Windows). Elsewhere `createAnimeRuntime` returns null; the tab, the settings panel and the version chip are not shown, the protocols are not registered and the IPC channels answer "unsupported".
- **Windows specifics (D-039):** folder names avoid the names Windows reserves and a trailing dot or space, and are shortened so a file path stays under 240 characters; what could not be deleted at once (a file the player has just let go of) is deleted again 500 ms later; cancelling kills the process tree with `taskkill /T /F`.
- **Tests:** `test/e2e/anime.e2e-spec.ts` drives the real app with `test/e2e/fixtures/fake-ani-cli.sh` (set through `PULLWAVE_ANI_CLI`) and a local HLS server that refuses requests without the right referer; `anime-live.e2e-spec.ts` talks to the real source when `PULLWAVE_LIVE=1`. The "Test Windows" workflow runs them (and the unit tests that do not assume POSIX paths) on a real Windows runner.

## Live streams
yt-dlp prints `CYBERINFO|<is_live>|<file>` before downloading → `QueueManager.applyInfo` marks the job `live` and starts a ticker that derives `elapsedSeconds` (own clock) and `downloadedBytes` (size of `<file>.part`). `queue:stop` (**STOP & SAVE**) → `QueueManager.stop` → SIGINT (file kept); cancel stays SIGTERM. `before-quit` awaits `QueueManager.shutdown()` when live jobs exist. See D-025.

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
| Subtitles | `--sub-langs <..>`, then `--embed-subs` or `--write-subs` (embedding removes the separate files), plus `--write-auto-subs` when enabled |
| Progress | `--newline --progress-template "download:CYBERPROG\|%(progress._percent_str)s\|..."` plus `--print after_move:CYBERFILE\|%(filepath)s` |
| Live streams | `--wait-for-video 30` (wait setting); `--live-from-start --downloader-args ffmpeg_i:-live_start_index 0` (from-start setting); `--print before_dl:CYBERINFO\|%(is_live)s\|%(filename)s` always |
| Extras | rate limit, concurrency, custom paths, JS runtime, extra args |
| Stream found on a page | `--referer <page>`, `--user-agent <UA used to find it>`, `--add-header Cookie:<cookies seen>`, `--force-ipv4/--force-ipv6` when the address is bound to an IP, file named from the page title |

## Languages
English, Portuguese, Spanish, Chinese and Japanese (D-029). The catalogs are in `src/shared/i18n/` (`en.ts` defines the keys, the other four are typed against it, so a missing key fails `tsc`). The renderer reads them through `useTranslator()`; the main process through `translateMain` (`src/main/services/language.ts`), which follows the saved `language` setting.

## Theme
Neon cyan/magenta/yellow on a dark background, mono font, scanlines, glitch on titles, glowing borders. Errors in neon red.

## Tests
- Unit: `test/main/**`, `test/renderer/**`, `test/shared/**`; helpers in `test/helpers/` (`mockApi.ts`, `fakeChild.ts`, `tempDir.ts`).
- e2e: `test/e2e/app.e2e-spec.ts` launches the real Electron app (run `npm run build` first) with a temporary `--user-data-dir` and `FAKE_YTDLP_LOG` to record the fake yt-dlp's argv and `PATH`.

## Bundled binaries
`scripts/fetch-binaries.mjs [--platform=linux|win32] [--out=<dir>] [--force]` → `resources/bin/` (git-ignored): `yt-dlp`, `ffmpeg`, `ffprobe`, `deno`, `ffmpeg-GPLv3.txt` on Linux (plus `resources/lib/` with ffmpeg's shared libraries, see D-024, and `resources/bin/ani/` with `ani-cli`, a static `busybox` and a static `curl`, each pinned to one version and one sha256, D-036), and the same with `.exe` on Windows (no `lib/`; `ani/` holds `ani-cli`, `busybox.exe` (busybox-w32, 64-bit Unicode) and `curl.exe`, D-039). Every download is checked against the checksum its source publishes. In dev the app uses `<appPath>/resources/bin`; packaged, `process.resourcesPath/bin`. See D-013.

## Platforms
| OS | Package | Built by | Auto-update |
|---|---|---|---|
| Ubuntu/Debian and derivatives | `.deb` | `npm run release` locally or the "Release Linux" workflow | yes (package manager, asks for a password) |
| Fedora | `.rpm` | same as above | yes (same mechanism) |
| Arch Linux | `.pacman` | same as above | yes (same mechanism) |
| Any Linux | `.AppImage` | same as above | yes (replaces its own file) |
| Windows 10/11 x64 | NSIS `…-setup.exe` (per-user, one click) | the "Release Windows" workflow (`npm run release:win` on a Windows machine) | yes (electron-updater, `latest.yml`) |

Platform differences live in small, injectable spots: `executableName`/`spawnEnv` in `binaryResolver.ts` (`.exe`, `Path` key), the yt-dlp asset name in `updater.ts`, and `checkTraySupport` (the D-Bus check only runs on Linux).
