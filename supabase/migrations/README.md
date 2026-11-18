# Migracoes

Rode os arquivos em ordem no SQL Editor do Supabase.

**Realtime:** so assine `postgres_changes` de tabelas que estao em `supabase_realtime`
(`table_messages`, `table_rolls`, `table_character_state`, `table_members`, `boards`,
`board_tokens`, `board_marks`). Assinar uma tabela fora da publicacao faz o servidor
descartar, sem erro, todos os eventos daquele canal.
