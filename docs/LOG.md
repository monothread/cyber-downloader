# Diário de sessões (append-only)

## 2026-09-30 · sessão-2026-09-30-a
- Plano aprovado (Electron + React, yt-dlp do sistema, escopo completo).
- Ambiente verificado: Node 22.23.2, npm 10.9.8, yt-dlp 2026.08.19, ffmpeg presente.
- Criada a pasta `docs/` (README, DECISIONS, ARCHITECTURE, CONVENTIONS, WORKFLOW, PROGRESS, ERRORS, LOG).
- `npm install` inicialmente interrompido; depois autorizado ("pode continuar todo o desenvolvimento").
- Implementado: scaffold, tipos compartilhados, serviços do main (args builder, parser, error mapper, runner, queue, stores, binaries, updater), IPC + preload, UI React cyberpunk completa, testes unit (216) e e2e (9).
- Binário do Electron baixado via `node node_modules/electron/install.js` (o postinstall não havia baixado).
- Download de teste real com yt-dlp (vídeo curto) para validar o formato de saída; arquivo removido.
- Restante: gerar artefatos de empacotamento (aguarda confirmação).
- Pendências resolvidas: setting `jsRuntime`, aviso em extraArgs, ícone `resources/icon.png`, `npm run dist` (AppImage + deb em `dist/`). Git deixado de fora a pedido.
- Binários embutidos (D-013): BinaryResolver, updater com download verificado, fetch-binaries.mjs, notices de licença, testes (243 unit, 11 e2e). Pacotes regerados (AppImage 256 MB, deb 210 MB).
- Auto-atualização (D-014): electron-updater + GitHub Releases, UI e testes (294 unit, 13 e2e); artefatos agora `cyber-downloader-<versão>.{AppImage,deb}`; `docs/RELEASING.md` criado.
