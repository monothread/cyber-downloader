# Error catalog

Every yt-dlp error is mapped by `errorMapper` into `{ code, title, hint, raw }`. UI: short banner + "show details" (raw) + "retry".

| code | Detection (stderr/exit) | Title | Hint |
|---|---|---|---|
| `NETWORK` | timeouts, `Unable to download`, DNS, HTTP 5xx | Network failure | Check your connection and try again. |
| `UNAVAILABLE` | `Video unavailable`, `Private video`, `removed`, `not available` | Video unavailable | The video may be private, removed or blocked in your region. |
| `LOGIN_REQUIRED` | `Sign in`, `age-restricted`, `members-only`, bot check | Login required | Enable browser cookies in the settings and make sure you are logged in. |
| `FFMPEG_MISSING` | `ffmpeg not found`, `ffprobe and ffmpeg not found` | ffmpeg not found | Install ffmpeg or set its path in the settings. |
| `FILENAME_TOO_LONG` | `File name too long`, `Errno 36` | Title too long | Reduce the maximum title length in the settings. |
| `OUTDATED` | `Unable to extract`, `Please update`, `Unsupported URL` | yt-dlp may be outdated | Use the update button to get the latest yt-dlp. |
| `BINARY_MISSING` | ENOENT on spawn | yt-dlp not found | Install yt-dlp or set its path in the settings. |
| `UNKNOWN` | everything else | Download failed | See the details below. |

Rules are checked in the order of the table above (first match wins).
New patterns: add a row here + a test in `test/main/services/errorMapper.test.ts`.
