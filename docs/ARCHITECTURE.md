# Architecture

## Folder structure
```
src/
  shared/        types.ts (Settings, DownloadJob, DownloadStatus, HistoryEntry, ...), constants.ts (IPC channels, defaults), url.ts
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
  preload/index.ts              # contextBridge with a typed API
  renderer/
    App.tsx, theme/cyberpunk.css
    components/ UrlInput, QueueList, JobCard, SettingsPanel, HistoryList, ErrorBanner, BinaryStatus,
                Toast, UpdateBanner, UpdateActions, fields
    hooks/ useAutoSaveSettings (debounced settings auto-save)
    store/ (zustand)
test/            # unit tests mirroring src
test/e2e/        # Playwright-Electron (fake yt-dlp via stub)
scripts/         # fetch-binaries.mjs
resources/       # icon.png, THIRD_PARTY_NOTICES.md, bin/ (git-ignored)
docs/
```

## Flow
Renderer (React) → `window.api` (preload, typed) → IPC → `registerHandlers` → `queueManager` → `ytdlpRunner` (spawn) → progress/error/finish events → IPC push → Zustand store → UI.

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

## Theme
Neon cyan/magenta/yellow on a dark background, mono font, scanlines, glitch on titles, glowing borders. Errors in neon red.

## Tests
- Unit: `test/main/**`, `test/renderer/**`, `test/shared/**`; helpers in `test/helpers/` (`mockApi.ts`, `fakeChild.ts`, `tempDir.ts`).
- e2e: `test/e2e/app.e2e-spec.ts` launches the real Electron app (run `npm run build` first) with a temporary `--user-data-dir` and `FAKE_YTDLP_LOG` to record the fake yt-dlp's argv and `PATH`.

## Bundled binaries
`scripts/fetch-binaries.mjs` → `resources/bin/{yt-dlp,ffmpeg,ffprobe,deno,ffmpeg-GPLv3.txt}` (git-ignored). In dev the app uses `<appPath>/resources/bin`; packaged, `process.resourcesPath/bin`. See D-013.
