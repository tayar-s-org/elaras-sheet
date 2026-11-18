# Migracoes

Rode os arquivos em ordem no SQL Editor do Supabase.

**Realtime:** so assine `postgres_changes` de tabelas que estao em `supabase_realtime`
(`table_messages`, `table_rolls`, `table_character_state`, `table_members`, `boards`,
`board_tokens`, `board_marks`, `table_state_log`, `xp_awards`, `money_awards`, `table_clock`,
`table_clock_log`, `table_routine_days`). Assinar uma tabela fora da publicacao faz o servidor
descartar, sem erro, todos os eventos daquele canal.
