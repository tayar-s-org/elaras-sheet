# Migracoes

Rode os arquivos de avanço em ordem no SQL Editor do Supabase (ou `node scripts/db.mjs <arquivo>`).

## Ordem e numeração

- A ordem é a do nome do arquivo (`ls` em ordem alfabética). **Rollbacks não são migrações de avanço**: ficam em `rollbacks/`
  (`0023_rollback.sql`, `0024_rollback.sql`, `0026_rollback.sql`) e nunca entram na sequência. Rode um só quando quiser desfazer aquela migração.
- Números repetidos, todos com ordem definida:
  - `0020_training_calendar.sql` e depois `0020_training_gm_self.sql` (a `0022_training_guard_merge.sql` junta as duas regras de aprovação);
  - `0023_campaign_clock.sql`, `0024_time_engine.sql` e `0026_aptitude.sql` têm o rollback do mesmo número em `rollbacks/`.
- Arquivos novos usam o próximo número livre (hoje, `0052`).
- `0018_custom_items.sql` ficou vazio no histórico; foi reconstruída a partir do banco publicado (ver o cabeçalho dela). A `0021` assume a tabela dela
  e **não pode ser repetida** (`alter table ... add column` e `create function` sem `if not exists`/`or replace`). A `0050` a substitui nas funções.

## Como saber o que já foi aplicado

Não há tabela de controle: confira o efeito da migração no banco (somente leitura):

```bash
node scripts/db.mjs --query "select to_regclass('public.table_custom_items') is not null as m0018, exists (select 1 from information_schema.columns where table_name='table_custom_items' and column_name='price') as m0021, to_regclass('public.inventory_log') is not null as m0039, to_regclass('public.master_audit_log') is not null as m0040, to_regclass('public.table_shop_items') is not null as m0041, exists (select 1 from information_schema.columns where table_name='table_shop_items' and column_name='source_id') as m0044, exists (select 1 from pg_policies where policyname='master_audit_select_own') as m0045, to_regproc('public.lock_custom_item_request') is not null as m0050, exists (select 1 from pg_proc where proname='_join_table' and prosrc like '%for no key update%') as m0051"
```

Para outra migração, procure um objeto que só ela cria (tabela, coluna, função em `pg_proc`, política em `pg_policies`) ou que só ela muda
(trecho em `pg_get_functiondef`). Ao escrever uma migração nova, deixe esse marcador no cabeçalho e prefira `if not exists` / `create or replace`.

## Modelo de confiança da ficha

A ficha é **intencionalmente livre**: o dono do personagem pode gravar qualquer valor em `characters.data` (dinheiro, XP, inventário, perícias) pela API,
com a política de `0001_profiles_characters.sql`. Os gatilhos protegem só metadados (dono, mesa, revisão). Por isso nenhuma regra de economia ou progressão
é garantida contra o próprio dono; o histórico de concessões e compras (`money_awards`, `xp_awards`, `inventory_log`, `master_audit_log`) é um registro, não
uma trava. As funções (`grant_money`, `gm_give_item`, `shop_buy`, `approve_custom_item`...) conferem permissão **entre pessoas** (só o mestre concede; ninguém altera a ficha
de outro jogador direto pela API) e fazem as mudanças de forma atômica, mas não impedem o dono de editar a própria ficha.
Mudar isso exigiria separar dados autoritativos (dinheiro, XP, mochila) de `characters.data` e restringir a escrita a RPCs validadas.

**Realtime:** so assine `postgres_changes` de tabelas que estao em `supabase_realtime`
(`table_messages`, `table_rolls`, `table_character_state`, `table_members`, `boards`,
`board_tokens`, `board_marks`, `table_state_log`, `xp_awards`, `money_awards`, `table_clock`,
`table_clock_log`, `table_routine_days`, `inventory_log`). Assinar uma tabela fora da publicacao faz o servidor
descartar, sem erro, todos os eventos daquele canal.

## Sistema de rotinas e tempo da campanha (0023 a 0025)

Rode nesta ordem. Todas podem ser repetidas sem estragar nada (`create or replace`, `if not exists`).

- `0023_campaign_clock.sql`: relogio da mesa, agenda por dia, rotinas presas a ficha, migracao das rotinas antigas
  (backup em `*_backup_0023`). Desfazer: `rollbacks/0023_rollback.sql`.
- `0024_time_engine.sql`: ledger, acumuladores de XP, `advance_time`, evolucao. Desfazer: `rollbacks/0024_rollback.sql`.
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
- `0044_approved_shop.sql`: **Loja aprovada**. Todo item customizado aprovado pelo mestre vira anúncio em `table_shop_items` (coluna nova `source_id` → `table_custom_items`, mesmo id do pedido, pago em `$`) por um gatilho em `table_custom_items`; revogar tira o anúncio, quem já comprou fica com o item. Preço 0 (grátis) só nos anúncios aprovados. Reescreve `gm_shop_upsert` e `shop_buy` (mesma assinatura, comportamento antigo preservado) e troca o `check` de preço; `master_hub_version()` passa a devolver 4. Preenche a loja com os itens já aprovados. Depende da 0041/0043. Pode ser repetida. **Aplique e valide (`node scripts/masterHubDbTest.mjs`) antes de publicar o app.**
- `0045_audit_own_rewards.sql`: o dono do personagem passa a ler, em `master_audit_log`, as linhas de categoria `wallet` e `experience` do **próprio** personagem (política `master_audit_select_own`), para o registro da mesa sob o tabuleiro (aba "XP e dinheiro") mostrar moedas e experiências personalizadas. O mestre continua lendo tudo. Só cria uma política; pode ser repetida.
- `0046_conditions_delta_and_state_guard.sql`: `table_character_state.state` só aceita objeto JSON (linhas antigas fora do formato viram `{}`; restrição `check`) e o gatilho `state_keep_conditions` recusa estado que não seja objeto, então um jogador não apaga as condições do mestre escrevendo `[]` e depois `{}`. Cria `gm_conditions_delta` (mestre acrescenta/remove condições por id sob trava da linha, via `gm_set_conditions`) para duas abas não sobrescreverem uma à outra. Aditiva. Depende da 0040; pode ser repetida.
- `0047_idempotent_claims.sql`: entrega de benefícios em duas fases. `peek_pending_benefits` lista evoluções, melhorias de feitiço e perícias aprovadas **sem marcar entrega**; `confirm_benefits` marca por id depois que o app aplicou e a ficha foi salva. As funções `claim_*` antigas continuam como estão. **Aplique antes de publicar o app novo.** Aditiva; pode ser repetida.
- `0048_magic_study_dice_cap.sql`: `attempt_spell_upgrade` deixa de limitar o total de dados de Astúcia a 24 (cada tentativa gasta 16; a regra vem do dono, ver `docs/`). Só remove o teto; pode ser repetida.
- `0049_party_resource_update.sql`: `set_state_resource` e `set_state_faint` gravam **um** recurso (vida, estamina, mana...) ou o desmaio sob trava da linha, em vez de regravar o estado inteiro. **Aplique antes de publicar o app novo.** Aditiva; pode ser repetida.
- `0050_custom_item_money_safe.sql`: `approve_custom_item` e `revoke_custom_item` passam a travar a ficha e o pedido na mesma transação e a **debitar/reembolsar `characters.data.money`
  na hora** (linha já resgatada em `money_awards`, como `grant_money`), então o saldo nunca fica furado e aprovar/revogar ao mesmo tempo só movimenta o dinheiro uma vez. Cria `lock_custom_item_request` (interno).
  Reescreve duas funções da 0021 (`create or replace`, mesmas assinaturas e mensagens); pode ser repetida. Teste de banco: `node scripts/concurrencyDbTest.mjs`.
- `0051_table_capacity_lock.sql`: o limite de jogadores é serializado: `_join_table` (0028) e `decide_member` (0002) travam a linha da mesa antes de contar as vagas.
  Reescreve duas funções em uso (`create or replace`); pode ser repetida. Teste de banco: `node scripts/concurrencyDbTest.mjs`.
