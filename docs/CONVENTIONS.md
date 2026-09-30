# Convenções

## Código
- TypeScript strict; sem `any` desnecessário; tipos/interfaces em `src/shared/` (ou arquivo de tipos dedicado), nunca inline quando cabe em interface.
- Arrow functions sempre com bloco e `return` explícito (sem retorno implícito).
- Condicionais sempre com `{}` (evitar `if (x) return y;`).
- Funções pequenas e focadas; extrair quando acumular responsabilidades; sem duplicação.
- Modificar apenas o que a tarefa exige; observações fora de escopo vão em notas, sem tocar.

## Testes
- Todo módulo tem teste completo: definição, todos os ifs/else, loops, chamadas com parâmetros exatos, sucesso, falha e bordas.
- Unit **e** e2e avaliados sempre que o código de produção mudar.
- e2e: verificar status/resultado, headers relevantes (se HTTP) e payload/shape completo.
- Asserts com valores concretos (`toEqual`, `toMatchObject`); sem `any`/`expect.anything()` (exceção: `expect.any(Date)`).
- Nomes de `describe`/`it` e comentários de teste em **inglês**.

## Verificação obrigatória ao fim de qualquer tarefa
```
npx tsc --noEmit --project tsconfig.json
npx eslint src/ test/ --max-warnings=0
npx vitest run
```
Corrigir tudo antes de dar a tarefa por concluída.

## Git
- Commits em inglês; sem atribuição de IA em nenhum arquivo/commit/PR.
- Nunca fazer push/deploy sem confirmação explícita.

## Confirmações
Antes de apagar arquivos, sobrescrever em larga escala, remover dependências ou chamadas externas irreversíveis: listar o impacto e pedir "sim" explícito.

## Resumo final de cada tarefa
Arquivos alterados · o que mudou (1 linha/arquivo) · arquivos intencionalmente não tocados · follow-ups.
