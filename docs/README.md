# Cyber Downloader — Documentação

App desktop Linux (Electron + React + TypeScript) que encapsula o `yt-dlp`, com tema cyberpunk.

## Comece por aqui (sessões/agentes novos)
1. Leia `PROGRESS.md` — estado atual e próxima tarefa.
2. Leia `DECISIONS.md` — decisões já tomadas (não reabra sem motivo).
3. Leia `ARCHITECTURE.md` e `CONVENTIONS.md` antes de escrever código.
4. Siga `WORKFLOW.md` (protocolo de handoff) ao começar e ao terminar.

## Índice
| Arquivo | Conteúdo |
|---|---|
| `PROGRESS.md` | Checklist por fase/tarefa, status, dono, notas de handoff |
| `DECISIONS.md` | Registro de decisões (ADR leve), com contexto e consequências |
| `ARCHITECTURE.md` | Estrutura de pastas, módulos, fluxo IPC, mapeamento feature → args do yt-dlp |
| `CONVENTIONS.md` | Padrões de código, testes, lint, commits |
| `WORKFLOW.md` | Como retomar trabalho, dividir tarefas entre agentes, atualizar docs |
| `ERRORS.md` | Catálogo de erros do yt-dlp e mensagens amigáveis |
| `RELEASING.md` | Como publicar uma versão e como o app se atualiza |
| `LOG.md` | Diário cronológico de sessões (append-only) |

## Regra de ouro
Toda sessão termina com `PROGRESS.md` e `LOG.md` atualizados. Decisão nova → entrada em `DECISIONS.md`.
