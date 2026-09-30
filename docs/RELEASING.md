# Publishing a new version

The app updates itself (via `electron-updater`) from the **public Releases** of
`github.com/monothread/cyber-downloader`. Configuration lives in `electron-builder.yml` (`publish`).

## Step by step
1. Bump the version in `package.json` (`"version": "0.2.0"`, semver; the app only offers versions **greater** than the installed one).
2. Run the checks: `npx tsc --noEmit --project tsconfig.json`, `npx eslint src/ test/ --max-warnings=0`, `npx vitest run`, `npm run test:e2e`.
3. Create a GitHub token with permission to write Releases on the repository and export it:
   `export GH_TOKEN=<token>`
4. Publish: `npm run release` (downloads the bundled binaries, builds, and uploads a **draft** Release to GitHub with
   `cyber-downloader-<version>.AppImage`, `.deb`, `latest-linux.yml` and the `.blockmap` files).
5. On GitHub, open the draft Release, review it and click **Publish release**.
   Drafts are **not** seen by installed apps.
6. In the Release notes, mention where the FFmpeg source code can be found (static build from https://johnvansickle.com/ffmpeg/, GPLv3).

`npm run dist` generates the same files in `dist/` **without publishing** (it uses `--publish never`).

## How the app updates
- On startup (if "Check for updates on startup" is on, 5 s after opening) and via the **CHECK FOR UPDATES** button in Settings.
- If a newer version exists, a yellow banner appears with **UPDATE TO x.y.z** → downloads (only the changed blocks) → **RESTART & INSTALL**.
- Installing takes a separate click on purpose: restarting interrupts downloads in progress.
- **AppImage:** replaces its own file (needs write permission where the file lives).
- **.deb:** `electron-updater` uses the package manager and asks for a password (polkit/pkexec).
- In development (`npm run dev`) the app shows "Updates are only available in the installed app.".
- With no Release published yet, the check shows "No published versions on GitHub" — that is expected before the first one.

## Things to keep in mind
- The repository must be **public** (the app does not carry a token).
- The bundled yt-dlp has its own update mechanism (the "UPDATE YT-DLP" button), independent of the app version.
- ffmpeg and deno only change when you rebuild the package (`npm run fetch-binaries -- --force`) and release a new version.
- Code signing is not required on Linux.
