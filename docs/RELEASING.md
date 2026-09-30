# Publicando uma nova versão

O app se atualiza sozinho (via `electron-updater`) a partir das **Releases públicas** de
`github.com/monothread/cyber-downloader`. Configuração em `electron-builder.yml` (`publish`).

## Passo a passo
1. Suba a versão em `package.json` (`"version": "0.2.0"`, semver; o app só oferece versões **maiores** que a instalada).
2. Rode as verificações: `npx tsc --noEmit --project tsconfig.json`, `npx eslint src/ test/ --max-warnings=0`, `npx vitest run`, `npm run test:e2e`.
3. Crie um token do GitHub com permissão de escrever em Releases do repositório e exporte:
   `export GH_TOKEN=<token>`
4. Publique: `npm run release` (baixa os binários embutidos, compila e envia para o GitHub uma Release **em rascunho** com:
   `cyber-downloader-<versão>.AppImage`, `.deb`, `latest-linux.yml` e os `.blockmap`).
5. No GitHub, abra a Release em rascunho, confira e clique em **Publish release**.
   Rascunhos **não** são vistos pelos apps instalados.
6. Nas notas da Release, cite o código-fonte do ffmpeg usado (build estática de https://johnvansickle.com/ffmpeg/, GPLv3).

`npm run dist` gera os mesmos arquivos em `dist/` **sem publicar** (usa `--publish never`).

## Como o app se atualiza
- Ao abrir (se "Check for updates on startup" estiver ligado, 5 s depois) e pelo botão **CHECK FOR UPDATES** em Settings.
- Se houver versão nova, aparece um banner amarelo com **UPDATE TO x.y.z** → baixa (só os blocos que mudaram) → **RESTART & INSTALL**.
- A instalação exige um clique separado de propósito: reiniciar interrompe downloads em andamento.
- **AppImage:** troca o próprio arquivo (precisa de permissão de escrita no local onde ele está).
- **.deb:** o `electron-updater` usa o gerenciador de pacotes e pede senha (polkit/pkexec).
- Em desenvolvimento (`npm run dev`) o app mostra "Updates are only available in the installed app.".
- Sem nenhuma Release publicada, a checagem mostra "No published versions on GitHub" — normal antes da primeira.

## Atenção
- O repositório precisa ser **público** (o app não carrega token).
- O yt-dlp embutido tem atualização própria (botão "UPDATE YT-DLP"), independente da versão do app.
- ffmpeg e deno só mudam quando você refaz o pacote (`npm run fetch-binaries -- --force`) e lança nova versão.
- Não é necessária assinatura de código no Linux.
