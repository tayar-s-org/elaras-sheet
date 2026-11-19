# Elara's Sheet — instruções para o Claude

Projeto: SPA React 19 + Vite 6 (ficha de Savage Worlds + plataforma multiplayer) com Supabase (projeto `ttjzhxhnpifvbipyonxs`)
publicada no GitHub Pages. Falar com o usuário sempre em **português**.

## Rodar SQL / migrações no Supabase (autorizado pelo usuário)

O usuário liberou que **qualquer sessão** aplique as migrações sozinha, sem pedir para ele colar no SQL Editor:

```bash
node scripts/db.mjs supabase/migrations/00NN_nome.sql      # roda um arquivo
node scripts/db.mjs --query "select ..."                    # roda uma consulta (também serve para conferir o estado)
node scripts/db.mjs --file arquivo.sql --dry                # só mostra o SQL
```

O script usa o `SUPABASE_ACCESS_TOKEN` que está em `.env.local` (ignorado pelo git) e a Management API.

Regras:
- **Nunca** escrever o token em arquivo versionado, commit, mensagem, log ou resposta. Não imprimir `.env.local`. Nunca commitar `.env*`.
- **Nunca** usar a chave `service_role`.
- As migrações **não têm tabela de controle**: antes de aplicar, confira se já foi aplicada (por exemplo, se a tabela, coluna ou função existe
  em `information_schema`/`pg_proc`). Prefira escrever migrações que possam rodar de novo (`if not exists`, `create or replace`).
- Migração só aditiva (criar tabela, coluna, função, política): pode aplicar direto e depois testar com contas descartáveis.
- Migração que **apaga ou altera dados/estruturas existentes** (`drop`, `delete`, `truncate`, mudar tipo de coluna, reescrever uma função
  que já está em uso por outro recurso): mostre um resumo ao usuário e espere o "pode rodar" antes.
- Aplique só migrações do **seu** trabalho. Há outras sessões editando a pasta; não rode a migração de outra sessão que ainda está em
  desenvolvimento. Se o arquivo estiver vazio (0 bytes), não rode.
- Depois de aplicar, diga ao usuário o que foi aplicado e o resultado dos testes.
- Teste com contas descartáveis (`elara.teste.*@mailinator.com`) via supabase-js e a chave publicável do `.env.local` (`VITE_SUPABASE_ANON_KEY`).

## Fluxo de commit e publicação

- Outras sessões deixam arquivos alterados na pasta: faça commit **só dos seus arquivos** (`git add <arquivos>`), nunca `git add -A`
  sem conferir `git status`. Para arquivos misturados, monte uma versão baseada no HEAD (`git hash-object -w` + `git update-index --cacheinfo`).
- Antes de publicar: `npm test`, `npx vite build` e, de preferência, o mesmo numa cópia limpa do índice (`git checkout-index -a -f --prefix=...`).
- Publicar = `git push origin main`; o GitHub Pages faz o deploy (`gh run watch`). Site: https://tayar-s-org.github.io/elaras-sheet/
- Novos arquivos de teste precisam entrar no script `test` do `package.json`.
