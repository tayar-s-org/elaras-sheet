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
