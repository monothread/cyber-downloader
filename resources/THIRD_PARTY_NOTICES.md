# Third-party software bundled with Cyber Downloader

This application redistributes unmodified binaries of the following projects.

| Component | Purpose | License | Source |
|---|---|---|---|
| yt-dlp | Video downloading | The Unlicense | https://github.com/yt-dlp/yt-dlp |
| FFmpeg / ffprobe (static build by John Van Sickle) | Merging and converting media | GPLv3 (see `bin/ffmpeg-GPLv3.txt`) | https://johnvansickle.com/ffmpeg/ (source and build scripts available there) |
| Deno | JavaScript runtime used by yt-dlp for YouTube | MIT | https://github.com/denoland/deno |
| Electron / Chromium | Application runtime | MIT and various (see the bundled `LICENSE` and `LICENSES.chromium.html`) | https://www.electronjs.org |

The FFmpeg binaries are separate programs executed as child processes; they are not linked into the application.
