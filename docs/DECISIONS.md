# Decisões

Formato: `D-NNN` · data · status (aceita/substituída) · contexto · decisão · consequências.
Nunca apague; se mudar, crie nova entrada e marque a antiga como "substituída por D-XXX".

## D-001 · 2026-09-30 · aceita — Framework: Electron + React + TypeScript
- **Contexto:** app desktop Linux em TS com tema cyberpunk (CSS rico).
- **Decisão:** Electron + Vite (`electron-vite`) + React 18. Alternativas descartadas: Tauri (parte em Rust), Electron sem React.
- **Consequências:** binário maior (~100MB+); UI e estilização simples; tudo em TS.

## D-002 · 2026-09-30 · substituída por D-013 — yt-dlp/ffmpeg do sistema
- **Decisão:** detectar `yt-dlp`/`ffmpeg` no PATH (caminho configurável) + botão de atualizar yt-dlp. Não embutir binário.
- **Ambiente atual:** yt-dlp 2026.08.19 em `/usr/local/bin`, ffmpeg em `/usr/bin`, Node v22.23.2, npm 10.9.8.
- **Consequências:** exige instalação prévia; UI deve avisar se ausente.

## D-003 · 2026-09-30 · aceita — Escopo inicial
Inclui: fila com progresso (velocidade/ETA/cancelar), modo só áudio (mp3/m4a/opus), playlists e legendas, histórico persistido, cookies do browser, pasta padrão, melhor áudio+vídeo, formato de saída, limite de tamanho do título, erros amigáveis.

## D-004 · 2026-09-30 · aceita — Stack de apoio
Zustand (estado), `electron-store` (persistência), Vitest + Testing Library (unit), Playwright-Electron (e2e), ESLint `--max-warnings=0`, `electron-builder` (AppImage + deb).

## D-005 · 2026-09-30 · aceita — Título longo
Setting `maxTitleLength` (padrão 80) → `-o "%(title).{N}s [%(id)s].%(ext)s"` + `--trim-filenames`; `--restrict-filenames` opcional. Evita falha por limite de 255 bytes do filesystem.

## D-006 · 2026-09-30 · aceita — Segurança
`spawn` com array de args (sem shell), URL http/https validada, `contextIsolation: true`, `nodeIntegration: false`, sandbox, CSP restritiva, IPC apenas por canais tipados do preload.

## D-007 · 2026-09-30 · aceita — Documentação em `docs/`
Todo progresso/decisão fica em `docs/` para permitir múltiplas sessões e agentes. Ver `WORKFLOW.md`.

## D-008 · 2026-09-30 · aceita — Persistência própria em JSON (sem electron-store)
- **Contexto:** `electron-store@11` é ESM-only e o main é empacotado em CJS.
- **Decisão:** `JsonStore<T>` (escrita atômica tmp+rename) em `src/main/services/jsonStore.ts`; `settings.json` e `history.json` em `userData`. Settings passam por `sanitizeSettings` (clamp/enum/regex) sempre que lidos ou salvos.
- **Substitui:** parte de D-004.

## D-009 · 2026-09-30 · aceita — Versões de tooling
- `vite@7` + `@vitejs/plugin-react@5` (electron-vite 5 exige vite ≤ 7). Config do bundler deve se chamar `electron.vite.config.ts`.
- Vitest 5: sem `environmentMatchGlobs`; testes de renderer usam `// @vitest-environment jsdom` no topo do arquivo.
- `tsconfig.json` único cobrindo `src`, `test` e configs (sem `baseUrl`; aliases `@shared`, `@main`, `@renderer` via `paths`).
- e2e usa `*.e2e-spec.ts` e yt-dlp falso por `ytdlpPath` em `settings.json`.

## D-010 · 2026-09-30 · aceita — Protocolo de saída do yt-dlp
Linhas prefixadas: progresso `CYBERPROG|pct|speed|eta|title` (`--progress-template`) e arquivo final `CYBERFILE|path` (`--print after_move:`), com `--no-simulate`. Vídeo+áudio separados fazem o percentual reiniciar (uma vez por stream); aceito na UI.

## D-011 · 2026-09-30 · aceita — Sandbox do Chromium ligado
`sandbox: true`, `contextIsolation: true`. Funciona neste ambiente sem `--no-sandbox`; em distros com userns restrito usar `--no-sandbox` (documentado no README).

## D-012 · 2026-09-30 · aceita — Runtime JavaScript e argumentos extras
Novo setting `jsRuntime` → `--js-runtimes <valor>` (YouTube exige runtime JS para todos os formatos; deno não está instalado, node está). Campo de argumentos extras avisa que opções como `--exec` executam comandos.

## D-013 · 2026-09-30 · aceita — Binários embutidos no app (substitui D-002)
- **Decisão:** o pacote traz yt-dlp (`yt-dlp_linux`), ffmpeg + ffprobe (build estático) e deno em `resources/bin` (copiados para `<resources>/bin` via `extraResources`). Baixados por `scripts/fetch-binaries.mjs` (`npm run fetch-binaries`, roda no `npm run dist`), cada um verificado por checksum (sha256/md5).
- **Resolução (`BinaryResolver`):** yt-dlp = caminho custom → `userData/bin/yt-dlp` (atualizado) → embutido → sistema. ffmpeg = custom → embutido → sistema. `--ffmpeg-location` recebe a pasta embutida (ffmpeg+ffprobe) ou o caminho custom.
- **Runtime JS:** o processo do yt-dlp recebe `PATH` com a pasta embutida na frente, então o deno embutido é achado sem `--js-runtimes`; o campo `jsRuntime` vira override opcional.
- **Atualização:** sem caminho custom, baixa `yt-dlp_linux` da última release do GitHub (compara `tag_name` com `--version`, verifica `SHA2-256SUMS`) para `userData/bin/yt-dlp`; com caminho custom, roda `-U` nele. O AppImage é read-only, por isso o binário atualizado vive em userData.
- **Licenças:** `resources/THIRD_PARTY_NOTICES.md` vai junto (ffmpeg é GPLv3; texto em `bin/ffmpeg-GPLv3.txt`).
- **Consequências:** AppImage ~256 MB, deb ~210 MB; o deb não depende mais de yt-dlp/ffmpeg do apt.

## D-014 · 2026-09-30 · aceita — Auto-atualização do app via electron-updater + GitHub Releases
- **Decisão:** `electron-updater` com provider `github` (`monothread/cyber-downloader`, repo público), `autoDownload=false` e `autoInstallOnAppQuit=false`: o usuário clica para baixar e depois para reiniciar/instalar (evita matar downloads sem aviso).
- **Código:** `AppUpdateService` (máquina de estados idle/checking/available/downloading/downloaded/not-available/error/unsupported, com `UpdaterLike` injetável) + `electronUpdater.ts` (adapter); IPC `app-update:*` e evento `event:app-update-state`; UI: `UpdateBanner`, `UpdateActions` e seção "APP UPDATES" em Settings; setting `checkUpdatesOnStart` (padrão ligado, checa 5 s após abrir, só empacotado).
- **Empacotamento:** `artifactName: cyber-downloader-${version}.${ext}` (sem espaços, para bater com `latest-linux.yml`); `npm run dist` usa `--publish never`, `npm run release` publica (rascunho) com `GH_TOKEN`.
- **Alternativas descartadas:** atualizador próprio (reimplementa integridade/diferencial) e apenas aviso com link (não atualiza com um clique).
