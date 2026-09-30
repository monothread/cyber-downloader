# Third-party software bundled with Cyber Downloader

This application redistributes unmodified binaries of the following projects.

| Component | Purpose | License | Source |
|---|---|---|---|
| yt-dlp (`yt-dlp_linux` / `yt-dlp.exe`) | Video downloading | The Unlicense. The official binaries are PyInstaller bundles that also embed Python (PSF License) and other libraries; see the yt-dlp repository for their licenses | https://github.com/yt-dlp/yt-dlp |
| FFmpeg / ffprobe | Merging and converting media | GPLv3 (see `bin/ffmpeg-GPLv3.txt`). Linux: static build by John Van Sickle. Windows: "essentials" build by gyan.dev | https://johnvansickle.com/ffmpeg/ , https://www.gyan.dev/ffmpeg/builds/ (source and build information available there and at https://ffmpeg.org) |
| Deno | JavaScript runtime used by yt-dlp for YouTube | MIT | https://github.com/denoland/deno |
| Electron / Chromium | Application runtime | MIT and various (see the bundled `LICENSE.electron.txt` / `LICENSE` and `LICENSES.chromium.html`) | https://www.electronjs.org |

The FFmpeg binaries are separate programs executed as child processes; they are not linked into the application.
