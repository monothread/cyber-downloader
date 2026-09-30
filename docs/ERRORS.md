# Catálogo de erros

Cada erro do yt-dlp é mapeado por `errorMapper` em `{ code, title, hint, raw }`. UI: banner curto + "ver detalhes" (raw) + "tentar novamente".

| code | Detecção (stderr/exit) | Título | Dica |
|---|---|---|---|
| `NETWORK` | timeouts, `Unable to download`, DNS | Falha de rede | Verifique a conexão e tente de novo |
| `UNAVAILABLE` | `Video unavailable`, `Private video`, `removed` | Vídeo indisponível | Pode ser privado ou removido |
| `LOGIN_REQUIRED` | `Sign in`, `age-restricted`, `cookies` | Login necessário | Ative cookies do browser nas configurações |
| `FFMPEG_MISSING` | `ffmpeg not found`, `ffprobe` | ffmpeg ausente | Instale o ffmpeg |
| `FILENAME_TOO_LONG` | `File name too long` | Título muito longo | Reduza o tamanho máximo do título |
| `OUTDATED` | `Please update`, extractor error | yt-dlp desatualizado | Use o botão de atualizar |
| `BINARY_MISSING` | ENOENT ao spawn | yt-dlp não encontrado | Instale ou configure o caminho |
| `UNKNOWN` | demais | Erro ao baixar | Veja os detalhes |

Novos padrões: adicionar linha aqui + teste em `test/main/services/errorMapper.test.ts`.
