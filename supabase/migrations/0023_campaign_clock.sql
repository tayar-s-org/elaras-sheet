-- Fase 2 do novo sistema de rotinas: relogio da campanha, agenda por dia da campanha e rotinas presas a ficha.
--
-- O que esta migration faz (pode rodar de novo sem estragar nada):
--  1) Guarda copias de seguranca das rotinas e do calendario antigos (so na primeira vez) em *_backup_0023.
--  2) table_clock / table_clock_log: o relogio da mesa. tick = horas desde o inicio; 0 = Primeiro Mes, dia 1, 06:00.
--     O tempo so anda quando o mestre chama advance_clock, e so se todos os personagens estiverem em dia.
--  3) table_training.character_id: cada rotina pertence a uma ficha (nao so ao jogador). Trocar de ficha na mesa
--     NAO leva as rotinas junto.
--  4) Rotinas antigas: a grade passa a comecar as 06:00 (a hora antiga continua sendo a mesma hora), o original fica
--     em data.legacy_v1 e TODAS voltam a rascunho para o jogador revisar e o mestre aprovar de novo.
--  5) table_routine_days: qual rotina (aprovada) cada ficha faz em cada dia da campanha. Dia que ja comecou e
--     dia passado ficam travados.
--  6) check_advance / advance_clock: validacao obrigatoria no servidor. Nao existe dia vazio tratado como descanso.
--
-- Para desfazer: 0023_rollback.sql.

-- 1) Copias de seguranca (so existem se ainda nao foram criadas; rodar de novo nao sobrescreve o original).
create table if not exists public.table_training_backup_0023 as select * from public.table_training;
create table if not exists public.table_training_calendar_backup_0023 as select * from public.table_training_calendar;
alter table public.table_training_backup_0023 enable row level security;
alter table public.table_training_calendar_backup_0023 enable row level security;

-- 2) Relogio.
create table if not exists public.table_clock (
  table_id uuid primary key references public.tables(id) on delete cascade,
  tick int not null default 0 check (tick >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);
alter table public.table_clock enable row level security;
drop policy if exists "clock_select" on public.table_clock;
create policy "clock_select" on public.table_clock for select to authenticated
  using (public.is_member(table_id));

create table if not exists public.table_clock_log (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.tables(id) on delete cascade,
  from_tick int not null,
  to_tick int not null,
  hours int not null,
  kind text not null default 'hours' check (kind in ('hours', 'days')),
  checked jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists table_clock_log_idx on public.table_clock_log (table_id, id desc);
alter table public.table_clock_log enable row level security;
drop policy if exists "clock_log_select" on public.table_clock_log;
create policy "clock_log_select" on public.table_clock_log for select to authenticated
  using (public.is_member(table_id));

create or replace function public.clock_tick(t uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select c.tick from public.table_clock c where c.table_id = t), 0);
$$;

-- Dia que ja comecou (depois da primeira hora) ou ja passou: o jogador nao troca mais a rotina dele.
create or replace function public.routine_day_locked(t uuid, d int) returns boolean
language sql stable security definer set search_path = public as $$
  select d < public.clock_tick(t) / 24 or (d = public.clock_tick(t) / 24 and public.clock_tick(t) % 24 > 0);
$$;

-- A ficha e do usuario atual, aprovada na mesa.
create or replace function public.my_character_in(t uuid, ch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.table_members
    where table_id = t and user_id = auth.uid() and character_id = ch and status = 'approved'
  );
$$;

-- 3) Rotinas presas a ficha.
alter table public.table_training add column if not exists character_id uuid references public.characters(id) on delete set null;
create index if not exists table_training_character_idx on public.table_training (table_id, character_id);

-- 4) Rotinas antigas. Os triggers de aprovacao ficam desligados so durante esta conversao (no SQL Editor nao ha
-- auth.uid(), e eles recusariam a alteracao).
alter table public.table_training disable trigger user;
update public.table_training t set character_id = m.character_id
  from public.table_members m
  where m.table_id = t.table_id and m.user_id = t.user_id and t.character_id is null;
update public.table_training t set
  data = (t.data - 'rows') || jsonb_build_object(
    'v', 2,
    'legacy_v1', t.data,
    'rows', (select jsonb_agg(coalesce(t.data -> 'rows' -> ((i + 5) % 24), '{}'::jsonb) order by i) from generate_series(0, 23) i)
  ),
  status = 'draft',
  reviewed_at = null,
  review_note = 'Rotina do sistema antigo: revise e envie de novo.'
where (t.data -> 'v') is null and jsonb_typeof(t.data -> 'rows') = 'array';
update public.table_training t set
  data = t.data || jsonb_build_object('v', 2, 'legacy_v1', t.data),
  status = 'draft', reviewed_at = null,
  review_note = 'Rotina do sistema antigo: revise e envie de novo.'
where (t.data -> 'v') is null;
alter table public.table_training enable trigger user;

-- Daqui para frente: a ficha vem do vinculo do membro na mesa (o cliente nao escolhe) e nunca muda.
create or replace function public.training_character_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.character_id := (
      select m.character_id from public.table_members m
      where m.table_id = new.table_id and m.user_id = new.user_id and m.status = 'approved'
    );
    if new.character_id is null then raise exception 'Vincule uma ficha a esta mesa antes de criar rotinas.'; end if;
  else
    new.character_id := old.character_id;
  end if;
  return new;
end $$;
drop trigger if exists training_character_guard on public.table_training;
create trigger training_character_guard before insert or update on public.table_training
  for each row execute function public.training_character_guard();

-- 5) Agenda por dia da campanha.
create table if not exists public.table_routine_days (
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  day_no int not null check (day_no between 0 and 36000),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  routine_id uuid not null references public.table_training(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (table_id, character_id, day_no)
);
create index if not exists table_routine_days_routine_idx on public.table_routine_days (routine_id);
alter table public.table_routine_days enable row level security;

drop policy if exists "routine_days_select" on public.table_routine_days;
create policy "routine_days_select" on public.table_routine_days for select to authenticated
  using (public.is_member(table_id));
drop policy if exists "routine_days_insert" on public.table_routine_days;
create policy "routine_days_insert" on public.table_routine_days for insert to authenticated
  with check (user_id = auth.uid() and public.my_character_in(table_id, character_id) and public.table_accepts_messages(table_id));
drop policy if exists "routine_days_update" on public.table_routine_days;
create policy "routine_days_update" on public.table_routine_days for update to authenticated
  using (user_id = auth.uid() and public.my_character_in(table_id, character_id))
  with check (user_id = auth.uid() and public.my_character_in(table_id, character_id) and public.table_accepts_messages(table_id));
drop policy if exists "routine_days_delete" on public.table_routine_days;
create policy "routine_days_delete" on public.table_routine_days for delete to authenticated
  using (user_id = auth.uid() and public.my_character_in(table_id, character_id));

create or replace function public.routine_day_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if tg_op = 'DELETE' then
    -- Apagar a mesa, a ficha ou uma rotina de dias futuros (cascata) passa; so a remocao direta de dia travado e recusada.
    if pg_trigger_depth() = 1 and public.routine_day_locked(old.table_id, old.day_no) then
      raise exception 'Este dia já começou ou passou e não pode mais ser alterado.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    new.table_id := old.table_id; new.character_id := old.character_id; new.day_no := old.day_no; new.user_id := old.user_id;
  end if;
  if public.routine_day_locked(new.table_id, new.day_no) then
    raise exception 'Este dia já começou ou passou e não pode mais ser alterado.';
  end if;
  select t.status, t.character_id, t.table_id into r from public.table_training t where t.id = new.routine_id;
  if not found or r.table_id <> new.table_id or r.character_id is distinct from new.character_id or r.status <> 'approved' then
    raise exception 'Só rotinas aprovadas pelo mestre, desta ficha, podem ir para o calendário.';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists routine_day_guard on public.table_routine_days;
create trigger routine_day_guard before insert or update or delete on public.table_routine_days
  for each row execute function public.routine_day_guard();

-- Uma rotina usada em dia que ja comecou ou passou nao pode ser apagada (e o historico do que foi feito).
create or replace function public.training_delete_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() = 1 and exists (
    select 1 from public.table_routine_days d
    where d.routine_id = old.id and public.routine_day_locked(d.table_id, d.day_no)
  ) then
    raise exception 'Esta rotina foi usada em dias que já começaram ou passaram e não pode ser apagada.';
  end if;
  return old;
end $$;
drop trigger if exists training_delete_guard on public.table_training;
create trigger training_delete_guard before delete on public.table_training
  for each row execute function public.training_delete_guard();

-- 6) Validacao obrigatoria. Todo personagem aprovado da mesa precisa, em TODOS os dias do atual ate o dia de destino
-- (inclusive), de uma rotina atribuida e aprovada. Devolve so as pendencias (vazio, pending, rejected, draft).
create or replace function public.check_advance(p_table uuid, p_hours int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur int; d0 int; d1 int; found_problems jsonb; total_chars int;
begin
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode verificar o avanço do tempo.'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 8640 then raise exception 'Informe de 1 a 8640 horas.'; end if;
  cur := public.clock_tick(p_table);
  d0 := cur / 24;
  d1 := (cur + p_hours) / 24;
  select count(*) into total_chars from public.table_members m
    where m.table_id = p_table and m.status = 'approved' and m.character_id is not null;
  select coalesce(jsonb_agg(x order by (x ->> 'name'), (x ->> 'dayNo')::int), '[]'::jsonb) into found_problems
  from (
    select jsonb_build_object(
      'characterId', m.character_id, 'userId', m.user_id, 'name', coalesce(c.name, ''), 'dayNo', g.d,
      'routineId', tr.id, 'note', coalesce(tr.review_note, ''),
      'state', case
        when tr.id is null then 'empty'
        when tr.status = 'approved' then 'ok'
        when tr.status = 'pending' then 'pending'
        when nullif(btrim(tr.review_note), '') is not null then 'rejected'
        else 'draft' end) as x,
      (tr.status = 'approved') as is_ok
    from public.table_members m
    join public.characters c on c.id = m.character_id
    cross join generate_series(d0, d1) as g(d)
    left join public.table_routine_days rd
      on rd.table_id = p_table and rd.character_id = m.character_id and rd.day_no = g.d
    left join public.table_training tr
      on tr.id = rd.routine_id and tr.table_id = p_table and tr.character_id = m.character_id
    where m.table_id = p_table and m.status = 'approved' and m.character_id is not null
  ) q
  where not coalesce(q.is_ok, false);
  return jsonb_build_object('tick', cur, 'hours', p_hours, 'fromDay', d0, 'toDay', d1,
    'characters', total_chars, 'days', d1 - d0 + 1, 'problems', found_problems);
end $$;

-- Avanca o relogio. Falha (e nada muda) se o relogio andou desde que o mestre olhou (p_expected_tick) ou se houver
-- qualquer pendencia. Fase 3 troca isto por advance_time, que tambem processa as atividades.
create or replace function public.advance_clock(p_table uuid, p_hours int, p_expected_tick int, p_kind text default 'hours') returns int
language plpgsql security definer set search_path = public as $$
declare cur int; chk jsonb; n int;
begin
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode avançar o tempo.'; end if;
  if not public.table_accepts_messages(p_table) then raise exception 'Esta mesa está encerrada.'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 8640 then raise exception 'Informe de 1 a 8640 horas.'; end if;
  if p_kind not in ('hours', 'days') then raise exception 'Tipo de avanço inválido.'; end if;
  insert into public.table_clock (table_id) values (p_table) on conflict (table_id) do nothing;
  select c.tick into cur from public.table_clock c where c.table_id = p_table for update;
  if cur <> p_expected_tick then
    raise exception 'O relógio da mesa mudou (agora %). Atualize e tente de novo.', cur;
  end if;
  chk := public.check_advance(p_table, p_hours);
  n := jsonb_array_length(chk -> 'problems');
  if n > 0 then
    raise exception 'Avanço bloqueado: % pendência(s) nos calendários dos personagens.', n using detail = chk::text;
  end if;
  update public.table_clock set tick = cur + p_hours, updated_at = now(), updated_by = auth.uid() where table_id = p_table;
  insert into public.table_clock_log (table_id, from_tick, to_tick, hours, kind, checked)
  values (p_table, cur, cur + p_hours, p_hours, p_kind,
    jsonb_build_object('characters', chk -> 'characters', 'days', chk -> 'days', 'fromDay', chk -> 'fromDay', 'toDay', chk -> 'toDay'));
  return cur + p_hours;
end $$;

revoke all on function public.check_advance(uuid, int) from public, anon;
revoke all on function public.advance_clock(uuid, int, int, text) from public, anon;
revoke all on function public.clock_tick(uuid) from public, anon;
revoke all on function public.routine_day_locked(uuid, int) from public, anon;
revoke all on function public.my_character_in(uuid, uuid) from public, anon;

-- Tempo real: relogio e agenda chegam na hora para todos da mesa.
do $$ begin alter publication supabase_realtime add table public.table_clock; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.table_clock_log; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.table_routine_days; exception when duplicate_object then null; end $$;
