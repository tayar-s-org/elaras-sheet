# Migracoes

Rode os arquivos em ordem no SQL Editor do Supabase.

**Realtime:** so assine `postgres_changes` de tabelas que estao em `supabase_realtime`
(`table_messages`, `table_rolls`, `table_character_state`, `table_members`, `boards`,
`board_tokens`, `board_marks`, `table_state_log`, `xp_awards`, `money_awards`, `table_clock`,
`table_clock_log`, `table_routine_days`, `inventory_log`). Assinar uma tabela fora da publicacao faz o servidor
descartar, sem erro, todos os eventos daquele canal.

## Sistema de rotinas e tempo da campanha (0023 a 0025)

Rode nesta ordem. Todas podem ser repetidas sem estragar nada (`create or replace`, `if not exists`).

- `0023_campaign_clock.sql`: relogio da mesa, agenda por dia, rotinas presas a ficha, migracao das rotinas antigas
  (backup em `*_backup_0023`). Desfazer: `0023_rollback.sql`.
- `0024_time_engine.sql`: ledger, acumuladores de XP, `advance_time`, evolucao. Desfazer: `0024_rollback.sql`.
- `0025_work_and_study.sql`: solicitacoes (trabalho e melhoria de feitiço), salario, tentativa de aprimorar.
- `0029_aptitude_permanent.sql`: Aptidão (0026): pontos confirmados passam a ser permanentes (só dá para acrescentar).
  Atenção: os arquivos `0027_custom_skills.sql` e `0028_character_table.sql` são de outra frente (perícias personalizadas e vínculo ficha-mesa).
- `0031_stamina_floor.sql`: a rotina (`advance_time`) nunca deixa a estamina abaixo de 1 no servidor. Depende da 0026; pode ser repetida.
- `0032_custom_skill_attribute.sql`: perícia personalizada com atributo obrigatório nos pedidos novos (a rotina rende 1 de XP da perícia e 0,5 do atributo). Depende da 0027; pode ser repetida.
- `0033_incap_through_bonus.sql`: a incapacitação desce a escada inteira, inclusive o d12+N (d12+2 → d12+1 → d12 → d10). Recria `roll_dice` a partir da 0024; pode ser repetida.
- `0034_token_hidden_name_effects.sql`: criaturas com **nome oculto** e **efeitos** no token. Cria `board_tokens.name_hidden` e `board_tokens.effects`
  e a tabela `board_token_secrets`, que só o mestre da mesa lê. Com o nome oculto, o gatilho `tokens_hidden_name` guarda o nome e a imagem
  reais nessa tabela e deixa `name = ''` e `image_path = null` na linha que os jogadores leem (nem o Realtime os entrega); ao desocultar, os
  valores voltam. Jogadores não alteram `name_hidden` nem `effects`. Aditiva; pode ser repetida. Não reescreve `tokens_before_insert/update`.
- `0035_grant_applies_to_sheet.sql`: `grant_xp` e `grant_money` gravam o XP/dinheiro direto na ficha (`characters.data`) e marcam a concessão como
  recebida, então entram mesmo com o app do jogador fechado. O app do jogador (`useRewardSync` + `sheetRebase.js`) só atualiza a ficha aberta.
  **Publique o app novo antes de rodar**, senão um app antigo aberto acusa "ficha mudou em outro lugar". Pode ser repetida.
- `0036_xp_remove.sql`: o mestre pode remover XP (valor negativo em `grant_xp`; a ficha nunca fica abaixo de 0). Depende da 0035; pode ser repetida.

- `0037_creature_editor.sql`: adiciona fichas rápidas e aparência editável a criaturas e predefinições. O formato privado dos tokens depende da 0034. Aplique antes de publicar o frontend que usa o novo editor. Tokens antigos continuam usando o PNG existente até serem editados.
- `0038_map_library.sql`: biblioteca privada por mesa, bucket `map-library` e troca transacional do cenário ativo. Aplique antes de publicar o frontend.
- `0039_inventory_items.sql`: inventário. `inventory_consume` (só diminui quantidade), `inventory_set_fill` (nível do cantil), `inventory_transfer`
  (transferência atômica entre personagens aprovados da mesma mesa) e `gm_give_item` (mestre entrega item do catálogo ou criado por ele); todas
  escrevem em `characters.data.inventory` com lock da linha. Tabela `inventory_log` (só leitura para membros; dispara a sincronização da ficha e do token).
  Aditiva; pode ser repetida. Teste de banco: `node scripts/itemsDbTest.mjs` (cria e apaga contas descartáveis).

- `0040_master_hub.sql`: **Central do Mestre**. Histórico administrativo (`master_audit_log`, só o mestre lê), moedas e carteiras
  (`table_currencies`, `character_wallets`), tipos de experiência e contadores (`table_experience_types`, `character_experience`), o gatilho
  `state_keep_conditions` (preserva `table_character_state.state.conditions` contra qualquer escrita que não seja do RPC) e os RPCs do mestre
  (`gm_adjust_money`, `gm_adjust_xp`, `gm_give_items`, `gm_upsert_currency`, `gm_delete_currency`, `gm_wallet_adjust`, `gm_upsert_experience_type`,
  `gm_delete_experience_type`, `gm_experience_adjust`, `gm_set_conditions`, `master_hub_version`). Todos idempotentes por `request_id`.
  Não reescreve `grant_money`, `grant_xp` nem `gm_give_item`. Aditiva; pode ser repetida. **Aplique e valide
  (`node scripts/masterHubDbTest.mjs`) antes de publicar o app que usa a Central.** Detalhes em `src/features/room/masterHub/README.md`.
- `0041_master_shop.sql`: **Loja do Mestre**. `table_shop_items` (item do mestre + moeda da mesa + preço), `gm_shop_upsert`/`gm_shop_delete` (mestre) e `shop_buy` (jogador
  compra para o próprio personagem: debita a carteira e põe o item na mochila numa transação; idempotente por `request_id`). `master_hub_version()` passa a devolver 2.
  Depende da 0040. Aditiva; pode ser repetida. Não reescreve nenhuma função em uso. **Aplique e valide (`node scripts/masterHubDbTest.mjs`) antes de publicar o app.**
- `0042_experience_public.sql`: os contadores de experiência (`character_experience`, da 0040) passam a ser lidos por **todos os membros da mesa** (antes só dono e mestre), como o XP. Só troca a política de leitura; a escrita continua só pelo RPC do mestre e a carteira de moedas continua privada. Depende da 0040; pode ser repetida.
- `0043_shop_money_price.sql`: a Loja do Mestre também vende em **dinheiro ($)**, a moeda padrão da mesa. `table_shop_items.currency_id` passa a aceitar NULL (NULL = pago em $); `gm_shop_upsert` aceita `p_currency` nulo; `shop_buy` debita `characters.data.money` (ficha travada) e grava a linha negativa em `money_awards` no formato de `gm_adjust_money`, para a ficha aberta reconciliar sem conflito; `mh_shop_json` mostra `$`/Dinheiro no histórico; `master_hub_version()` passa a **3**. Reescreve funções da 0041 (`create or replace`, comportamento com moedas da mesa igual); depende da 0040/0041; pode ser repetida.
