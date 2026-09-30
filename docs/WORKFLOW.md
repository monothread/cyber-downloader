# Workflow multi-sessão / multi-agente

## Ao iniciar
1. Ler `PROGRESS.md` (achar tarefas `TODO` sem dependência pendente).
2. Ler `DECISIONS.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`.
3. Reservar a tarefa: mudar status para `DOING` e preencher `Dono` (ex.: `sessão-2026-09-30-a`).

## Durante
- Trabalhar em uma tarefa por vez; respeitar os arquivos listados na tarefa para evitar conflito entre agentes paralelos.
- Tarefas de fases diferentes só rodam em paralelo se não compartilham arquivos (coluna `Arquivos`).
- Decisão nova ou mudança de rumo → nova entrada em `DECISIONS.md`.
- Erro yt-dlp novo mapeado → `ERRORS.md`.

## Ao terminar
1. Rodar verificações de `CONVENTIONS.md` (tsc, eslint, vitest).
2. Marcar tarefa `DONE` em `PROGRESS.md` + nota de handoff (o que foi feito, o que falta, armadilhas).
3. Acrescentar entrada em `LOG.md` (data, dono, resumo, arquivos).

## Status permitidos
`TODO` · `DOING` · `BLOCKED` (explicar) · `DONE`

## Paralelização sugerida
- Fase 2: `ytdlpArgsBuilder`, `progressParser`, `errorMapper`, stores são independentes → agentes distintos.
- Fase 4: componentes de UI independentes após Fase 3 (contrato do preload fechado).
