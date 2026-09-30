# Progresso

Última atualização: 2026-09-30 · Todas as fases concluídas (AppImage e deb gerados em `dist/`).

| ID | Fase | Tarefa | Depende de | Arquivos | Status | Dono | Notas |
|---|---|---|---|---|---|---|---|
| 1.1 | 1 | Docs iniciais (`docs/`) | — | docs/* | DONE | sessão-2026-09-30-a |  |
| 1.2 | 1 | Scaffold: package.json, electron-vite, tsconfigs, ESLint, Vitest, Playwright | 1.1 | raiz | DONE | sessão-2026-09-30-a | vite pinado em 7 (peer do electron-vite 5); config se chama electron.vite.config.ts |
| 2.1 | 2 | `shared/types.ts` + `constants.ts` | 1.2 | src/shared | DONE | sessão-2026-09-30-a |  |
| 2.2 | 2 | `ytdlpArgsBuilder` + testes | 2.1 | src/main/services, test | DONE | sessão-2026-09-30-a |  |
| 2.3 | 2 | `progressParser` + testes | 2.1 | idem | DONE | sessão-2026-09-30-a |  |
| 2.4 | 2 | `errorMapper` + testes (+ `ERRORS.md`) | 2.1 | idem | DONE | sessão-2026-09-30-a |  |
| 2.5 | 2 | `binaryLocator` + `updater` + testes | 2.1 | idem | DONE | sessão-2026-09-30-a |  |
| 2.6 | 2 | `settingsStore` + `historyStore` + testes | 2.1 | idem | DONE | sessão-2026-09-30-a |  |
| 2.7 | 2 | `ytdlpRunner` + testes | 2.2, 2.3, 2.4 | idem | DONE | sessão-2026-09-30-a |  |
| 2.8 | 2 | `queueManager` + testes | 2.7 | idem | DONE | sessão-2026-09-30-a |  |
| 3.1 | 3 | IPC handlers + preload tipado + testes | 2.5, 2.6, 2.8 | src/main/ipc, src/preload | DONE | sessão-2026-09-30-a |  |
| 4.1 | 4 | Tema cyberpunk (CSS) + layout `App` | 3.1 | src/renderer | DONE | sessão-2026-09-30-a |  |
| 4.2 | 4 | `UrlInput` + `QueueList` + `JobCard` (progresso) | 4.1 | src/renderer/components | DONE | sessão-2026-09-30-a |  |
| 4.3 | 4 | `SettingsPanel` (pasta, cookies, formatos, qualidade, título, só áudio, playlist, legendas) | 4.1 | idem | DONE | sessão-2026-09-30-a |  |
| 4.4 | 4 | `ErrorBanner` + toast + `BinaryStatus` | 4.1 | idem | DONE | sessão-2026-09-30-a |  |
| 4.5 | 4 | `HistoryList` (abrir pasta/arquivo) | 4.1 | idem | DONE | sessão-2026-09-30-a |  |
| 5.1 | 5 | Testes de renderer (Testing Library) | 4.x | test | DONE | sessão-2026-09-30-a |  |
| 5.2 | 5 | e2e Playwright-Electron com yt-dlp stub | 4.x | test/e2e | DONE | sessão-2026-09-30-a |  |
| 6.1 | 6 | Empacotamento AppImage/deb + README | 5.x | electron-builder.yml, resources/icon.png | DONE | sessão-2026-09-30-a | AppImage + deb gerados; ícone em resources/ (gerado com Pillow, 512x512) |
| 7.1 | 7 | Embutir yt-dlp, ffmpeg, deno no pacote + atualizador próprio (D-013) | 6.1 | scripts/, src/main/services/binaryResolver.ts, updater.ts, electron-builder.yml | DONE | sessão-2026-09-30-a | Testado com PATH restrito: download mp4 (merge) e mp3 usando só os embutidos; pacote gerado e smoke-testado |
| 8.1 | 8 | Auto-atualização do app (D-014) | 7.1 | src/main/services/appUpdateService.ts, electronUpdater.ts, UI de update, docs/RELEASING.md | DONE | sessão-2026-09-30-a | Testado no pacote real: consulta o GitHub e responde "No published versions" (ainda sem Release). Fluxo de download/instalação só validável após a 1ª Release e uma versão maior |

## Notas de handoff
- Diretório do projeto: `/home/lucas/projects/downloader` (sem git; perguntar se deve inicializar).
- Plano original completo: `~/.claude/plans/quero-que-crie-um-concurrent-pebble.md` (resumido em `ARCHITECTURE.md`).

## Estado de verificação (2026-09-30)
- `npx tsc --noEmit --project tsconfig.json`: OK
- `npx eslint src/ test/ --max-warnings=0`: OK
- `npx vitest run`: 294 testes unit OK (31 arquivos)
- `npx playwright test` (após `npm run build`): 13 e2e OK com Electron real + yt-dlp falso (`test/e2e/fixtures/fake-yt-dlp.js`)
- Args do yt-dlp validados manualmente contra o yt-dlp real (download curto do vídeo de teste `jNQXAC9IVRw`).

## Pendências / follow-ups
- Validar o ciclo completo de auto-update: publicar 0.1.0 (`npm run release`), instalar, publicar 0.2.0 e clicar em atualizar (ver `RELEASING.md`).
- Git ainda não inicializado; o `repository`/`homepage` do package.json já apontam para monothread/cyber-downloader.
- Git ainda não inicializado (a pedido do usuário, deixado de fora por enquanto).
- Sem dedupe de URL repetida na fila; sem seletor de qualidade por vídeo (usa settings globais).
- Runtime JS do YouTube: deno embutido (achado via PATH do processo); `jsRuntime` em Settings > Advanced é override opcional.
- ffmpeg/deno embutidos não são atualizados pelo botão (só o yt-dlp); nova versão = rodar `npm run fetch-binaries -- --force` e refazer o pacote.
- Só x86_64 (URLs dos binários fixas em linux-x64).
