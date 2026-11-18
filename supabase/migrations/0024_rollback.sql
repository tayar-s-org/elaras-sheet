-- Desfaz a 0024 (use so se algo der errado). Apaga o ledger, os acumuladores de XP e as evolucoes pendentes criados
-- pelo novo motor; as rotinas, a agenda e o relogio (0023) continuam. O relogio volta a andar por advance_clock.
-- Atencao: o XP de treino e o historico gravados desde a 0024 se perdem. Faca antes um backup se precisar deles.

drop function if exists public.advance_time(uuid, int, int, text, jsonb, jsonb);
drop function if exists public.spend_progress(uuid, uuid, text, text, text);
drop function if exists public.claim_evolutions(uuid);
drop table if exists public.evolution_awards;
drop table if exists public.table_routine_runs;
drop table if exists public.character_progress;
drop table if exists public.character_training;
drop function if exists public.owns_character(uuid);

-- advance_clock de volta (igual a 0023: so confere as pendencias e move o relogio).
create or replace function public.advance_clock(p_table uuid, p_hours int, p_expected_tick int, p_kind text default 'hours') returns int
language plpgsql security definer set search_path = public as $$
declare cur int; chk jsonb; n int;
begin
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode avançar o tempo.'; end if;
  if not public.table_accepts_messages(p_table) then raise exception 'Esta mesa está encerrada.'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 8640 then raise exception 'Informe de 1 a 8640 horas.'; end if;
  insert into public.table_clock (table_id) values (p_table) on conflict (table_id) do nothing;
  select c.tick into cur from public.table_clock c where c.table_id = p_table for update;
  if cur <> p_expected_tick then raise exception 'O relógio da mesa mudou (agora %). Atualize e tente de novo.', cur; end if;
  chk := public.check_advance(p_table, p_hours);
  n := jsonb_array_length(chk -> 'problems');
  if n > 0 then raise exception 'Avanço bloqueado: % pendência(s) nos calendários dos personagens.', n using detail = chk::text; end if;
  update public.table_clock set tick = cur + p_hours, updated_at = now(), updated_by = auth.uid() where table_id = p_table;
  insert into public.table_clock_log (table_id, from_tick, to_tick, hours, kind, checked)
  values (p_table, cur, cur + p_hours, p_hours, p_kind, jsonb_build_object('characters', chk -> 'characters', 'days', chk -> 'days'));
  return cur + p_hours;
end $$;
revoke all on function public.advance_clock(uuid, int, int, text) from public, anon;

-- O log de estado e roll_dice continuam aceitando fracoes (inofensivo); nao ha motivo para reverter.
