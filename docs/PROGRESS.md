# Progress

Last updated: 2026-09-30 · All phases complete; code published to `github.com/monothread/cyber-downloader` (branch `main`).

| ID | Phase | Task | Depends on | Files | Status | Owner | Notes |
|---|---|---|---|---|---|---|---|
| 1.1 | 1 | Initial docs (`docs/`) | — | docs/* | DONE | session-2026-09-30-a | |
| 1.2 | 1 | Scaffold: package.json, electron-vite, tsconfigs, ESLint, Vitest, Playwright | 1.1 | root | DONE | session-2026-09-30-a | vite pinned to 7 (electron-vite 5 peer); config file is `electron.vite.config.ts` |
| 2.1 | 2 | `shared/types.ts` + `constants.ts` | 1.2 | src/shared | DONE | session-2026-09-30-a | |
| 2.2 | 2 | `ytdlpArgsBuilder` + tests | 2.1 | src/main/services, test | DONE | session-2026-09-30-a | |
| 2.3 | 2 | `progressParser` + tests | 2.1 | same | DONE | session-2026-09-30-a | |
| 2.4 | 2 | `errorMapper` + tests (+ `ERRORS.md`) | 2.1 | same | DONE | session-2026-09-30-a | |
| 2.5 | 2 | `binaryLocator` + `updater` + tests | 2.1 | same | DONE | session-2026-09-30-a | |
| 2.6 | 2 | `settingsStore` + `historyStore` + tests | 2.1 | same | DONE | session-2026-09-30-a | |
| 2.7 | 2 | `ytdlpRunner` + tests | 2.2, 2.3, 2.4 | same | DONE | session-2026-09-30-a | |
| 2.8 | 2 | `queueManager` + tests | 2.7 | same | DONE | session-2026-09-30-a | |
| 3.1 | 3 | IPC handlers + typed preload + tests | 2.5, 2.6, 2.8 | src/main/ipc, src/preload | DONE | session-2026-09-30-a | |
| 4.1 | 4 | Cyberpunk theme (CSS) + `App` layout | 3.1 | src/renderer | DONE | session-2026-09-30-a | |
| 4.2 | 4 | `UrlInput` + `QueueList` + `JobCard` (progress) | 4.1 | src/renderer/components | DONE | session-2026-09-30-a | |
| 4.3 | 4 | `SettingsPanel` (folder, cookies, formats, quality, title, audio only, playlist, subtitles) | 4.1 | same | DONE | session-2026-09-30-a | |
| 4.4 | 4 | `ErrorBanner` + toast + `BinaryStatus` | 4.1 | same | DONE | session-2026-09-30-a | |
| 4.5 | 4 | `HistoryList` (open folder/file) | 4.1 | same | DONE | session-2026-09-30-a | |
| 5.1 | 5 | Renderer tests (Testing Library) | 4.x | test | DONE | session-2026-09-30-a | |
| 5.2 | 5 | Playwright-Electron e2e with a yt-dlp stub | 4.x | test/e2e | DONE | session-2026-09-30-a | |
| 6.1 | 6 | AppImage/deb packaging + README | 5.x | electron-builder.yml, resources/icon.png | DONE | session-2026-09-30-a | AppImage + deb generated; icon in resources/ (generated with Pillow, 512x512) |
| 7.1 | 7 | Bundle yt-dlp, ffmpeg, deno in the package + own updater (D-013) | 6.1 | scripts/, src/main/services/binaryResolver.ts, updater.ts, electron-builder.yml | DONE | session-2026-09-30-a | Tested with a restricted PATH: mp4 (merge) and mp3 downloads using only the bundled binaries; package built and smoke-tested |
| 8.1 | 8 | App self-update (D-014) | 7.1 | src/main/services/appUpdateService.ts, electronUpdater.ts, update UI, docs/RELEASING.md | DONE | session-2026-09-30-a | Tested on the real package: it queries GitHub and answers "No published versions" (no Release yet). The download/install flow can only be validated after the first Release plus a higher version |
| 9.1 | 9 | Git repository + publish to GitHub | 8.1 | .git, LICENSE | DONE | session-2026-09-30-a | Branch `main` pushed to monothread/cyber-downloader; LICENSE is the MIT one created by GitHub (copyright monothread) |
| 10.1 | 10 | Settings auto-save + one input per link (D-015) | 9.1 | src/renderer/hooks, SettingsPanel.tsx, UrlInput.tsx, appStore.ts | DONE | session-2026-09-30-a | Committed locally; needs a new version/release to reach installed apps |
| 10.2 | 10 | Docs/code review fixes (D-016) | 10.1 | queueManager.ts, appUpdateService.ts, registerHandlers.ts, docs | DONE | session-2026-09-30-a | Quit cleanup, downloaded-state guard, openPath IPC removed, stale docs fixed |

## Handoff notes
- Project directory: `/home/lucas/projects/downloader`; remote `origin` = `https://github.com/monothread/cyber-downloader.git`.
- The remote also still has a leftover `master` branch (from the first push); it is unused and can be deleted.
- Original full plan: `~/.claude/plans/quero-que-crie-um-concurrent-pebble.md` (summarized in `ARCHITECTURE.md`).

## Verification status (2026-09-30)
- `npx tsc --noEmit --project tsconfig.json`: OK
- `npx eslint src/ test/ --max-warnings=0`: OK
- `npx vitest run`: 356 unit tests OK (33 files)
- `npx playwright test` (after `npm run build`): 20 e2e tests OK with the real Electron app + fake yt-dlp (`test/e2e/fixtures/fake-yt-dlp.js`)
- yt-dlp args validated manually against the real yt-dlp (short download of the test video `jNQXAC9IVRw`).

## Pending / follow-ups
- Playlist downloads are one job and one history entry: the title and file shown are those of the last item, and the percentage restarts for every item.
- `scripts/fetch-binaries.mjs` downloads the *latest* yt-dlp/ffmpeg/deno, so two builds of the same version can ship different binaries; pin versions if reproducible builds matter.
- The maintainer e-mail is in `package.json` and `electron-builder.yml` (the `.deb` needs one) and in the git history.
- Validate the full auto-update cycle: publish 0.1.0 (`npm run release`), install it, publish 0.2.0 and click update (see `RELEASING.md`).
- No deduplication of repeated URLs in the queue; no per-video quality selector (uses the global settings).
- YouTube JS runtime: bundled deno (found through the process PATH); `jsRuntime` in Settings > Advanced is an optional override.
- The bundled ffmpeg/deno are not updated by the button (only yt-dlp); a new version means running `npm run fetch-binaries -- --force` and rebuilding the package.
- x86_64 only (binary URLs are fixed to linux-x64).
