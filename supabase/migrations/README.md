# Migracoes

Rode os arquivos em ordem no SQL Editor do Supabase.

**Realtime:** so assine `postgres_changes` de tabelas que estao em `supabase_realtime`
(`table_messages`, `table_rolls`, `table_character_state`, `table_members`, `boards`,
`board_tokens`, `board_marks`, `table_state_log`, `xp_awards`, `money_awards`, `table_clock`,
`table_clock_log`, `table_routine_days`). Assinar uma tabela fora da publicacao faz o servidor
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
