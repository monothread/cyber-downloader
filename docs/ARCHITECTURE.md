# Arquitetura

## Estrutura de pastas
```
src/
  shared/        types.ts (Settings, DownloadJob, DownloadStatus, HistoryEntry, IpcChannels), constants.ts
  main/
    index.ts                    # janela, ciclo de vida
    ipc/registerHandlers.ts     # canais tipados
    services/
      binaryResolver.ts         # onde está cada binário (custom > atualizado > embutido > sistema)
      binaryLocator.ts          # probe de versão dos binários resolvidos
      ytdlpArgsBuilder.ts       # Settings + URL -> string[] (função pura)
      ytdlpRunner.ts            # spawn, progresso, cancelamento
      progressParser.ts         # parse de --progress-template
      errorMapper.ts            # stderr -> { code, title, hint, raw }
      queueManager.ts           # fila + concorrência
      jsonStore.ts / settingsSanitizer.ts / settingsStore.ts / historyStore.ts
      updater.ts                # atualiza yt-dlp (download verificado p/ userData/bin)
  preload/index.ts              # contextBridge com API tipada
  renderer/
    App.tsx, theme/cyberpunk.css
    components/ UrlInput, QueueList, JobCard, SettingsPanel, HistoryList, ErrorBanner, BinaryStatus
    store/ (zustand)
test/            # unit espelhando src
test/e2e/        # Playwright-Electron (yt-dlp fake via stub)
docs/
```

## Fluxo
Renderer (React) → `window.api` (preload, tipado) → IPC → `registerHandlers` → `queueManager` → `ytdlpRunner` (spawn) → eventos de progresso/erro/fim → IPC push → store Zustand → UI.

## Feature → args do yt-dlp (`ytdlpArgsBuilder`)
| Feature | Args |
|---|---|
| Pasta padrão | `-P <dir>` (fallback `~/Downloads`) |
| Cookies do browser | `--cookies-from-browser <browser>[:perfil]` (opcional, off por padrão) |
| Melhor áudio+vídeo | `-f "bv*+ba/b"`; teto: `bv*[height<=N]+ba/b` |
| Formato de saída | `--merge-output-format mp4\|mkv\|webm` |
| Só áudio | `-x --audio-format mp3\|m4a\|opus [--audio-quality]` |
| Tamanho do título | `-o "%(title).{N}s [%(id)s].%(ext)s" --trim-filenames` |
| Playlist | `--yes-playlist` / `--no-playlist` |
| Legendas | `--write-subs --sub-langs <..> [--embed-subs]` |
| Progresso | `--newline --progress-template "download:%(progress._percent_str)s\|%(progress._speed_str)s\|%(progress._eta_str)s"` |
| Extras | limite de banda, concorrência, caminhos custom, args extras |

## Tema
Neon ciano/magenta/amarelo sobre fundo escuro, fonte mono, scanlines, glitch em títulos, bordas com glow. Erros em vermelho neon.

## Testes
- Unit: `test/main/**`, `test/renderer/**`, `test/shared/**`; helpers em `test/helpers/` (`mockApi.ts`, `fakeChild.ts`, `tempDir.ts`).
- e2e: `test/e2e/app.e2e-spec.ts` lança o Electron real (`npm run build` antes) com `--user-data-dir` temporário e `FAKE_YTDLP_LOG` para registrar argv do yt-dlp falso.

## Binários embutidos
`scripts/fetch-binaries.mjs` → `resources/bin/{yt-dlp,ffmpeg,ffprobe,deno,ffmpeg-GPLv3.txt}` (git-ignored). Em dev o app usa `<appPath>/resources/bin`; empacotado, `process.resourcesPath/bin`. Ver D-013.
