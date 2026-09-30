# Decisions

Format: `D-NNN` · date · status (accepted/superseded) · context · decision · consequences.
Never delete an entry; if something changes, add a new one and mark the old one as "superseded by D-XXX".

## D-001 · 2026-09-30 · accepted — Framework: Electron + React + TypeScript
- **Context:** Linux desktop app in TypeScript with a cyberpunk theme (rich CSS).
- **Decision:** Electron + Vite (`electron-vite`) + React. Rejected alternatives: Tauri (part of it in Rust), Electron without React.
- **Consequences:** larger binary (~100MB+); simple UI and styling; everything in TypeScript.

## D-002 · 2026-09-30 · superseded by D-013 — System yt-dlp/ffmpeg
- **Decision:** detect `yt-dlp`/`ffmpeg` on the PATH (configurable path) + an update button for yt-dlp. Do not bundle binaries.
- **Consequences:** required a prior installation; the UI had to warn when a binary was missing.

## D-003 · 2026-09-30 · accepted — Initial scope
Includes: queue with progress (speed/ETA/cancel), audio-only mode (mp3/m4a/opus), playlists and subtitles, persisted history, browser cookies, default folder, best audio+video, output format, title length limit, friendly errors.

## D-004 · 2026-09-30 · accepted — Supporting stack
Zustand (state), Vitest + Testing Library (unit), Playwright-Electron (e2e), ESLint `--max-warnings=0`, `electron-builder` (AppImage + deb). Persistence: see D-008 (originally `electron-store`).

## D-005 · 2026-09-30 · accepted — Long titles
Setting `maxTitleLength` (default 80) → `-o "%(title).{N}s [%(id)s].%(ext)s"` + `--trim-filenames`; optional `--restrict-filenames`. Avoids failures caused by the 255-byte filesystem limit.

## D-006 · 2026-09-30 · accepted — Security
`spawn` with an args array (no shell), validated http/https URLs, `contextIsolation: true`, `nodeIntegration: false`, sandbox, restrictive CSP, IPC only through the typed preload channels.

## D-007 · 2026-09-30 · accepted — Documentation in `docs/`
All progress and decisions live in `docs/` so that multiple sessions and agents can work on the project. See `WORKFLOW.md`.

## D-008 · 2026-09-30 · accepted — Own JSON persistence (no electron-store)
- **Context:** `electron-store@11` is ESM-only and the main process is bundled as CJS.
- **Decision:** `JsonStore<T>` (atomic tmp+rename writes) in `src/main/services/jsonStore.ts`; `settings.json` and `history.json` in `userData`. Settings go through `sanitizeSettings` (clamp/enum/regex) whenever they are read or saved.
- **Supersedes:** part of D-004.

## D-009 · 2026-09-30 · accepted — Tooling versions
- `vite@7` + `@vitejs/plugin-react@5` (electron-vite 5 requires vite ≤ 7). The bundler config must be named `electron.vite.config.ts`.
- Vitest 5: no `environmentMatchGlobs`; renderer tests use `// @vitest-environment jsdom` at the top of the file.
- A single `tsconfig.json` covering `src`, `test` and configs (no `baseUrl`; aliases `@shared`, `@main`, `@renderer` via `paths`).
- e2e uses `*.e2e-spec.ts` and a fake yt-dlp injected through `ytdlpPath` in `settings.json`.

## D-010 · 2026-09-30 · accepted — yt-dlp output protocol
Prefixed lines: progress `CYBERPROG|pct|speed|eta|title` (`--progress-template`) and final file `CYBERFILE|path` (`--print after_move:`), with `--no-simulate`. Separate video+audio streams make the percentage restart (once per stream); accepted in the UI.

## D-011 · 2026-09-30 · accepted — Chromium sandbox on
`sandbox: true`, `contextIsolation: true`. Works in this environment without `--no-sandbox`; on distros with restricted user namespaces use `--no-sandbox` (documented in the README).

## D-012 · 2026-09-30 · accepted — JavaScript runtime and extra arguments
New setting `jsRuntime` → `--js-runtimes <value>` (YouTube needs a JS runtime for all formats). The extra-arguments field warns that options such as `--exec` run commands.

## D-013 · 2026-09-30 · accepted — Binaries bundled in the app (supersedes D-002)
- **Decision:** the package ships yt-dlp (`yt-dlp_linux`), ffmpeg + ffprobe (static build) and deno in `resources/bin` (copied to `<resources>/bin` through `extraResources`). Downloaded by `scripts/fetch-binaries.mjs` (`npm run fetch-binaries`, run by `npm run dist`), each one verified by checksum (sha256/md5).
- **Resolution (`BinaryResolver`):** yt-dlp = custom path → `userData/bin/yt-dlp` (updated) → bundled → system. ffmpeg = custom → bundled → system. `--ffmpeg-location` receives the bundled folder (ffmpeg+ffprobe) or the custom path.
- **JS runtime:** the yt-dlp process gets a `PATH` with the bundled folder first, so the bundled deno is found without `--js-runtimes`; the `jsRuntime` field becomes an optional override.
- **Updating:** without a custom path, downloads `yt-dlp_linux` from the latest GitHub release (compares `tag_name` with `--version`, verifies `SHA2-256SUMS`) into `userData/bin/yt-dlp`; with a custom path, runs `-U` on it. The AppImage is read-only, which is why the updated binary lives in userData.
- **Licenses:** `resources/THIRD_PARTY_NOTICES.md` ships with the package (ffmpeg is GPLv3; text in `bin/ffmpeg-GPLv3.txt`).
- **Consequences:** AppImage ~256 MB, deb ~210 MB; the deb no longer depends on the apt yt-dlp/ffmpeg.

## D-014 · 2026-09-30 · accepted — App self-update via electron-updater + GitHub Releases
- **Decision:** `electron-updater` with the `github` provider (`monothread/cyber-downloader`, public repo), `autoDownload=false` and `autoInstallOnAppQuit=false`: the user clicks to download and then to restart/install (avoids killing downloads without warning).
- **Code:** `AppUpdateService` (state machine idle/checking/available/downloading/downloaded/not-available/error/unsupported, with an injectable `UpdaterLike`) + `electronUpdater.ts` (adapter); IPC `app-update:*` and event `event:app-update-state`; UI: `UpdateBanner`, `UpdateActions` and an "APP UPDATES" section in Settings; setting `checkUpdatesOnStart` (on by default, checks 5 s after opening, packaged app only).
- **Packaging:** `artifactName: cyber-downloader-${version}.${ext}` (no spaces, so it matches `latest-linux.yml`); `npm run dist` uses `--publish never`, `npm run release` publishes (as a draft) using `GH_TOKEN`.
- **Rejected alternatives:** a custom updater (reimplements integrity/differential download) and a notification-only link (does not update with one click).
