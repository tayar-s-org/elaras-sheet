-- Desfaz a 0023 (use so se algo der errado). Restaura as rotinas a partir da copia feita pela propria 0023
-- (table_training_backup_0023) e remove o que ela criou. Nao apaga rotinas nem calendarios dos jogadores.
-- Atencao: o que foi criado DEPOIS da 0023 (novos dias da agenda, avancos do relogio) se perde.

-- Rotinas: dados, estado e nota voltam ao que eram antes da 0023.
alter table public.table_training disable trigger user;
update public.table_training t set
  data = b.data, status = b.status, reviewed_at = b.reviewed_at, review_note = b.review_note
from public.table_training_backup_0023 b
where b.id = t.id;
alter table public.table_training enable trigger user;

drop trigger if exists training_delete_guard on public.table_training;
drop function if exists public.training_delete_guard();
drop trigger if exists training_character_guard on public.table_training;
drop function if exists public.training_character_guard();

drop function if exists public.advance_clock(uuid, int, int, text);
drop function if exists public.check_advance(uuid, int);

drop trigger if exists routine_day_guard on public.table_routine_days;
drop function if exists public.routine_day_guard();
drop table if exists public.table_routine_days;

drop table if exists public.table_clock_log;
drop table if exists public.table_clock;

drop function if exists public.routine_day_locked(uuid, int);
drop function if exists public.clock_tick(uuid);
drop function if exists public.my_character_in(uuid, uuid);

-- A coluna character_id fica (e inofensiva) para nao perder o vinculo; as copias de seguranca tambem ficam.
-- Para apagar de vez: drop table public.table_training_backup_0023, public.table_training_calendar_backup_0023;
