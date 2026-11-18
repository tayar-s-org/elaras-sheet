-- Fase 3 do novo sistema de rotinas: motor de atividades, ledger, XP de treino e evolucao.
--
--  1) Estamina e mana passam a aceitar fracoes (descanso rende 1,5 por hora): o log de estado e as rolagens que leem
--     a estamina deixam de assumir numero inteiro. Rolagens de traco tambem passam a somar o bonus de d12+N.
--  2) table_routine_runs: o LEDGER. Uma linha por personagem e hora da campanha (unique), com o que foi feito, o
--     que custou, o que recuperou e o XP. Reprocessar a mesma hora nao paga nada duas vezes.
--  3) character_progress: acumuladores de XP por alvo (pericia, atributo, feitico) e modalidade (normal/focado):
--     available (gastavel, teto), earned_total (so cresce), spent_total, discarded_total.
--  4) character_training: horas de Estudo Mágico e estado do dia (descanso, meditacao...) por personagem.
--  5) advance_time: avanca o relogio E processa as atividades, numa unica transacao. Substitui advance_clock.
--  6) spend_progress / claim_evolutions: o jogador confirma a evolucao (servidor confere custo e saldo) e o app
--     dele aplica o novo dado na ficha (mesmo padrao do XP concedido pelo mestre).
--
-- Rode depois da 0023. Pode rodar de novo sem estragar nada.

-- 1a) Log de estado com fracoes.
alter table public.table_state_log alter column old_value type numeric using old_value::numeric;
alter table public.table_state_log alter column new_value type numeric using new_value::numeric;

create or replace function public.state_log_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text; old_v numeric; new_v numeric;
begin
  foreach k in array array['life', 'stamina', 'mana'] loop
    new_v := nullif(new.state ->> k, '')::numeric;
    if tg_op = 'UPDATE' then
      old_v := coalesce(nullif(old.state ->> k, '')::numeric, nullif(new.state -> 'max' ->> k, '')::numeric);
    else
      old_v := nullif(new.state -> 'max' ->> k, '')::numeric;
    end if;
    if new_v is not null and old_v is not null and new_v <> old_v then
      insert into public.table_state_log (table_id, character_id, user_id, resource, old_value, new_value)
      values (new.table_id, new.character_id, auth.uid(), k, old_v, new_v);
    end if;
  end loop;
  return null;
exception when others then
  return null; -- o historico nunca deve impedir a alteracao em si
end $$;

-- 2) Ledger.
create table if not exists public.table_routine_runs (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  tick int not null check (tick >= 0),
  day_no int not null,
  slot int not null check (slot between 0 and 23),
  routine_id uuid,
  routine_name text not null default '',
  row_snapshot jsonb not null default '{}'::jsonb,
  activity text not null default '' check (char_length(activity) <= 40),
  ok boolean not null default true,
  reason text not null default '' check (char_length(reason) <= 300),
  stamina_delta numeric not null default 0,
  mana_delta numeric not null default 0,
  stamina_after numeric,
  mana_after numeric,
  xp jsonb not null default '[]'::jsonb,
  detail jsonb not null default '{}'::jsonb check (pg_column_size(detail) < 4096),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (table_id, character_id, tick)
);
create index if not exists table_routine_runs_char_idx on public.table_routine_runs (table_id, character_id, tick desc);
alter table public.table_routine_runs enable row level security;

create or replace function public.owns_character(ch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.characters where id = ch and owner_id = auth.uid());
$$;
revoke all on function public.owns_character(uuid) from public, anon;

-- Dono da ficha e mestre leem; ninguem escreve direto (so advance_time).
drop policy if exists "runs_select" on public.table_routine_runs;
create policy "runs_select" on public.table_routine_runs for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));

-- 3) Acumuladores de XP.
create table if not exists public.character_progress (
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  kind text not null check (kind in ('skill', 'attribute', 'spell')),
  name text not null check (char_length(name) between 1 and 64),
  modality text not null check (modality in ('normal', 'focused')),
  available numeric not null default 0 check (available >= 0),
  earned_total numeric not null default 0 check (earned_total >= 0),
  spent_total numeric not null default 0 check (spent_total >= 0),
  discarded_total numeric not null default 0 check (discarded_total >= 0),
  cap numeric not null default 5000,
  updated_at timestamptz not null default now(),
  primary key (table_id, character_id, kind, name, modality),
  check (earned_total = available + spent_total + discarded_total)
);
alter table public.character_progress enable row level security;
drop policy if exists "progress_select" on public.character_progress;
create policy "progress_select" on public.character_progress for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));

-- 4) Horas de estudo e estado do dia.
create table if not exists public.character_training (
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  study_hours numeric not null default 0 check (study_hours >= 0),
  day_no int,
  day_state jsonb not null default '{}'::jsonb check (pg_column_size(day_state) < 4096),
  updated_at timestamptz not null default now(),
  primary key (table_id, character_id)
);
alter table public.character_training enable row level security;
drop policy if exists "training_state_select" on public.character_training;
create policy "training_state_select" on public.character_training for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));

-- 5) Avanco do tempo com processamento. Substitui advance_clock (que agora so recusa, para ninguem pular o motor).
create or replace function public.advance_clock(p_table uuid, p_hours int, p_expected_tick int, p_kind text default 'hours') returns int
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Use advance_time: o avanço agora também processa as atividades dos personagens.';
end $$;

create or replace function public.advance_time(
  p_table uuid, p_hours int, p_expected_tick int, p_kind text, p_events jsonb, p_days jsonb
) returns int
language plpgsql security definer set search_path = public as $$
declare
  cur int; chk jsonb; n int; nchars int;
  ev jsonb; xe jsonb; xr jsonb;
  ch uuid; t int; own_id uuid; rname text; mx jsonb; st jsonb; day_item record;
  s_d numeric; m_d numeric; mx_s numeric; mx_m numeric; cur_s numeric; cur_m numeric; new_s numeric; new_m numeric;
  amt numeric; kind_x text; name_x text; mod_x text; old_av numeric; cap_x numeric; kept numeric; pool record;
  detail jsonb;
begin
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode avançar o tempo.'; end if;
  if not public.table_accepts_messages(p_table) then raise exception 'Esta mesa está encerrada.'; end if;
  if p_hours is null or p_hours < 1 or p_hours > 240 then raise exception 'Cada avanço processa de 1 a 240 horas (10 dias). Avance em etapas.'; end if;
  if p_kind not in ('hours', 'days') then raise exception 'Tipo de avanço inválido.'; end if;
  if jsonb_typeof(p_events) <> 'array' or jsonb_typeof(p_days) <> 'object' then raise exception 'Dados do processamento inválidos.'; end if;

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

  -- Cobertura completa: exatamente um evento por personagem aprovado e por hora, sem repeticao nem hora fora do intervalo.
  select count(*) into nchars from public.table_members m
    where m.table_id = p_table and m.status = 'approved' and m.character_id is not null;
  if jsonb_array_length(p_events) <> nchars * p_hours then
    raise exception 'Processamento incompleto: esperados % eventos, recebidos %.', nchars * p_hours, jsonb_array_length(p_events);
  end if;
  if (select count(distinct (e ->> 'characterId') || ':' || (e ->> 'tick')) from jsonb_array_elements(p_events) e) <> nchars * p_hours then
    raise exception 'Processamento inválido: eventos repetidos.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_events) e
    where (e ->> 'tick')::int not between cur and cur + p_hours - 1
       or not exists (select 1 from public.table_members m where m.table_id = p_table and m.status = 'approved'
                      and m.character_id = (e ->> 'characterId')::uuid)
  ) then raise exception 'Processamento inválido: evento fora do intervalo ou de personagem que não está na mesa.'; end if;
  if (select count(*) from jsonb_object_keys(p_days)) <> nchars or exists (
    select 1 from jsonb_object_keys(p_days) k
    where not exists (select 1 from public.table_members m where m.table_id = p_table and m.status = 'approved' and m.character_id = k::uuid)
  ) then raise exception 'Processamento inválido: estado dos personagens incompleto.'; end if;

  for ev in select e from jsonb_array_elements(p_events) with ordinality as x(e, o) order by (e ->> 'tick')::int, o loop
    ch := (ev ->> 'characterId')::uuid;
    t := (ev ->> 'tick')::int;
    s_d := coalesce((ev ->> 'staminaDelta')::numeric, 0);
    m_d := coalesce((ev ->> 'manaDelta')::numeric, 0);
    -- Limites de sanidade de uma hora (o maior custo e 8, a maior recuperacao e 6; mana vai de -2 a +1).
    if s_d < -8 or s_d > 6 or m_d < -2 or m_d > 1 then raise exception 'Evento fora dos limites das regras (tick %).', t; end if;
    if char_length(coalesce(ev ->> 'activity', '')) > 40 or char_length(coalesce(ev ->> 'reason', '')) > 300 then raise exception 'Evento inválido.'; end if;
    if jsonb_typeof(coalesce(ev -> 'xp', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(ev -> 'xp', '[]'::jsonb)) > 6 then raise exception 'XP inválido.'; end if;
    for xe in select x from jsonb_array_elements(coalesce(ev -> 'xp', '[]'::jsonb)) x loop
      amt := (xe ->> 'amount')::numeric;
      if amt is null or amt <= 0 or amt > 1 or (xe ->> 'kind') not in ('skill', 'attribute', 'spell')
         or (xe ->> 'modality') not in ('normal', 'focused') or char_length(coalesce(xe ->> 'name', '')) not between 1 and 64 then
        raise exception 'XP inválido.';
      end if;
    end loop;

    select m.user_id into own_id from public.table_members m where m.table_id = p_table and m.character_id = ch and m.status = 'approved';
    select coalesce(tr.name, '') into rname from public.table_training tr where tr.id = nullif(ev ->> 'routineId', '')::uuid;
    mx := p_days -> (ch::text) -> 'max';
    detail := jsonb_strip_nulls(jsonb_build_object(
      'rest', ev -> 'rest', 'meditation', ev -> 'meditation', 'cost', ev -> 'cost', 'trainHour', ev -> 'trainHour',
      'study', ev -> 'study', 'spell', ev -> 'spell'));

    insert into public.table_routine_runs (table_id, character_id, user_id, tick, day_no, slot, routine_id, routine_name, row_snapshot,
      activity, ok, reason, stamina_delta, mana_delta, detail)
    values (p_table, ch, own_id, t, (ev ->> 'dayNo')::int, (ev ->> 'slot')::int, nullif(ev ->> 'routineId', '')::uuid, coalesce(rname, ''),
      coalesce(ev -> 'row', '{}'::jsonb), coalesce(ev ->> 'activity', ''), coalesce((ev ->> 'ok')::boolean, true), coalesce(ev ->> 'reason', ''),
      s_d, m_d, detail)
    on conflict (table_id, character_id, tick) do nothing;

    if found then
      -- Estamina e mana: soma o efeito no que o servidor tem agora, sem passar de 0 nem do maximo.
      select state into st from public.table_character_state where table_id = p_table and character_id = ch for update;
      mx_s := coalesce((st -> 'max' ->> 'stamina')::numeric, (mx ->> 'stamina')::numeric);
      mx_m := coalesce((st -> 'max' ->> 'mana')::numeric, (mx ->> 'mana')::numeric);
      if mx_s is null or mx_m is null or mx_s <= 0 or mx_s > 1000 or mx_m <= 0 or mx_m > 100000 then raise exception 'Máximos de estamina e mana inválidos.'; end if;
      if st is null then
        st := jsonb_build_object('life', coalesce((mx ->> 'life')::numeric, mx_s), 'stamina', mx_s, 'mana', mx_m,
          'max', jsonb_build_object('life', coalesce((mx ->> 'life')::numeric, mx_s), 'stamina', mx_s, 'mana', mx_m));
      elsif st -> 'max' is null then
        st := jsonb_set(st, '{max}', jsonb_build_object('life', coalesce((mx ->> 'life')::numeric, mx_s), 'stamina', mx_s, 'mana', mx_m));
      end if;
      cur_s := coalesce(nullif(st ->> 'stamina', '')::numeric, mx_s);
      cur_m := coalesce(nullif(st ->> 'mana', '')::numeric, mx_m);
      new_s := least(mx_s, greatest(0, cur_s + s_d));
      new_m := least(mx_m, greatest(0, cur_m + m_d));
      st := jsonb_set(jsonb_set(st, '{stamina}', to_jsonb(new_s)), '{mana}', to_jsonb(new_m));
      insert into public.table_character_state (table_id, character_id, state) values (p_table, ch, st)
        on conflict (table_id, character_id) do update set state = excluded.state;

      -- XP: respeita o teto de cada acumulador e guarda no ledger o saldo de depois.
      xr := '[]'::jsonb;
      for xe in select x from jsonb_array_elements(coalesce(ev -> 'xp', '[]'::jsonb)) x loop
        amt := (xe ->> 'amount')::numeric; kind_x := xe ->> 'kind'; name_x := xe ->> 'name'; mod_x := xe ->> 'modality';
        select * into pool from public.character_progress
          where table_id = p_table and character_id = ch and kind = kind_x and name = name_x and modality = mod_x for update;
        old_av := coalesce(pool.available, 0);
        cap_x := coalesce(pool.cap, 5000);
        kept := greatest(0, least(amt, cap_x - old_av));
        insert into public.character_progress (table_id, character_id, kind, name, modality, available, earned_total, discarded_total)
        values (p_table, ch, kind_x, name_x, mod_x, kept, amt, amt - kept)
        on conflict (table_id, character_id, kind, name, modality) do update set
          available = public.character_progress.available + kept,
          earned_total = public.character_progress.earned_total + amt,
          discarded_total = public.character_progress.discarded_total + (amt - kept),
          updated_at = now();
        select * into pool from public.character_progress
          where table_id = p_table and character_id = ch and kind = kind_x and name = name_x and modality = mod_x;
        xr := xr || jsonb_build_object('kind', kind_x, 'name', name_x, 'modality', mod_x, 'amount', amt, 'kept', kept, 'discarded', amt - kept,
          'availableAfter', pool.available, 'earnedAfter', pool.earned_total);
      end loop;
      update public.table_routine_runs set xp = xr, stamina_after = new_s, mana_after = new_m
        where table_id = p_table and character_id = ch and tick = t;

      -- Horas de Estudo Magico (cada 25 h rendem 1 dado de Astucia; o teto de 24 dados e aplicado na leitura).
      if coalesce((ev ->> 'study')::int, 0) = 1 and coalesce((ev ->> 'ok')::boolean, true) then
        insert into public.character_training (table_id, character_id, study_hours) values (p_table, ch, 1)
          on conflict (table_id, character_id) do update set study_hours = public.character_training.study_hours + 1, updated_at = now();
      end if;
    end if;
  end loop;

  -- Estado do dia de cada personagem (descanso em andamento, sessoes de meditacao...) para o proximo avanco continuar dai.
  for day_item in select key as k, value as v from jsonb_each(p_days) loop
    if jsonb_typeof(day_item.v -> 'state') <> 'object' then raise exception 'Estado do dia inválido.'; end if;
    insert into public.character_training (table_id, character_id, day_no, day_state)
    values (p_table, day_item.k::uuid, (day_item.v ->> 'dayNo')::int, day_item.v -> 'state')
    on conflict (table_id, character_id) do update set day_no = excluded.day_no, day_state = excluded.day_state, updated_at = now();
  end loop;

  update public.table_clock set tick = cur + p_hours, updated_at = now(), updated_by = auth.uid() where table_id = p_table;
  insert into public.table_clock_log (table_id, from_tick, to_tick, hours, kind, checked)
  values (p_table, cur, cur + p_hours, p_hours, p_kind,
    jsonb_build_object('characters', chk -> 'characters', 'days', chk -> 'days', 'fromDay', chk -> 'fromDay', 'toDay', chk -> 'toDay',
      'events', jsonb_array_length(p_events)));
  return cur + p_hours;
end $$;

revoke all on function public.advance_time(uuid, int, int, text, jsonb, jsonb) from public, anon;
revoke all on function public.advance_clock(uuid, int, int, text) from public, anon;

-- 6) Evolucao com confirmacao do jogador.
create table if not exists public.evolution_awards (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  kind text not null check (kind in ('skill', 'attribute')),
  name text not null check (char_length(name) between 1 and 64),
  modality text not null check (modality in ('normal', 'focused')),
  cost numeric not null check (cost > 0),
  created_at timestamptz not null default now(),
  claimed_at timestamp with time zone
);
create index if not exists evolution_awards_pending_idx on public.evolution_awards (character_id) where claimed_at is null;
alter table public.evolution_awards enable row level security;
drop policy if exists "evolution_select" on public.evolution_awards;
create policy "evolution_select" on public.evolution_awards for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));

-- Jogador confirma a evolucao de uma pericia ou atributo, gastando XP disponivel de UM acumulador (normal ou focado).
-- Custo: 100 por passo ate d12+1; depois 200, 300, 400... (d12+N custa 100 x N). Nunca mexe no total conquistado.
create or replace function public.spend_progress(p_table uuid, p_character uuid, p_kind text, p_name text, p_modality text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cdata jsonb; grp text; die int; bonus int; cost numeric; pool record;
begin
  if not public.owns_character(p_character) or not public.my_character_in(p_table, p_character) then raise exception 'Esta ficha não é sua nesta mesa.'; end if;
  if p_kind not in ('skill', 'attribute') then raise exception 'Só perícias e atributos evoluem com XP.'; end if;
  if p_modality not in ('normal', 'focused') then raise exception 'Modalidade inválida.'; end if;
  if exists (select 1 from public.evolution_awards where character_id = p_character and kind = p_kind and name = p_name and claimed_at is null) then
    raise exception 'A evolução anterior desta ficha ainda não foi aplicada. Abra a ficha e tente de novo.';
  end if;
  select data into cdata from public.characters where id = p_character;
  grp := case p_kind when 'skill' then 'skills' else 'attributes' end;
  die := coalesce((cdata -> grp ->> p_name)::int, 0);
  if p_kind = 'attribute' and die not in (4, 6, 8, 10, 12) then raise exception 'Atributo inválido.'; end if;
  if p_kind = 'skill' and die <> 0 and die not in (4, 6, 8, 10, 12) then raise exception 'Perícia inválida.'; end if;
  bonus := case when die = 12 then least(50, greatest(0, coalesce((cdata -> 'bonuses' -> grp ->> p_name)::int, 0))) else 0 end;
  cost := case when die >= 12 then 100 * (bonus + 1) else 100 end;
  select * into pool from public.character_progress
    where table_id = p_table and character_id = p_character and kind = p_kind and name = p_name and modality = p_modality for update;
  if not found or pool.available < cost then
    raise exception 'XP insuficiente: esta evolução custa % e há % disponível.', cost, coalesce(pool.available, 0);
  end if;
  update public.character_progress set available = available - cost, spent_total = spent_total + cost, updated_at = now()
    where table_id = p_table and character_id = p_character and kind = p_kind and name = p_name and modality = p_modality;
  insert into public.evolution_awards (table_id, character_id, kind, name, modality, cost) values (p_table, p_character, p_kind, p_name, p_modality, cost);
  return jsonb_build_object('cost', cost, 'kind', p_kind, 'name', p_name);
end $$;

-- O app do dono da ficha recolhe as evolucoes confirmadas e aplica na ficha.
create or replace function public.claim_evolutions(p_character uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.owns_character(p_character) then raise exception 'Ficha inválida.'; end if;
  with taken as (
    update public.evolution_awards set claimed_at = now()
    where character_id = p_character and claimed_at is null
    returning kind, name, created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'name', name) order by created_at), '[]'::jsonb) into out from taken;
  return out;
end $$;
revoke all on function public.spend_progress(uuid, uuid, text, text, text) from public, anon;
revoke all on function public.claim_evolutions(uuid) from public, anon;

do $$ begin alter publication supabase_realtime add table public.evolution_awards; exception when duplicate_object then null; end $$;

-- 1b) roll_dice: estamina fracionaria e bonus de d12+N. (copia da funcao de 0011 com duas mudancas, gerada abaixo)
create or replace function public.roll_dice(
  p_table uuid, p_spec jsonb, p_label text default '', p_visibility text default 'public', p_character uuid default null
) returns public.table_rolls
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  kind text;
  modifier int;
  mode text;
  terms jsonb;
  term jsonb;
  cnt int; sides int; expl boolean; neg boolean;
  total_dice int := 0;
  attempts jsonb := '[]'::jsonb;
  groups jsonb; rolled jsonb; vals int[];
  sub int; gsum int; attempt_total int;
  totals int[] := '{}';
  n_attempts int; chosen int := 1; a int; i int;
  formula_parts text[] := '{}';
  formula text; res jsonb; final_total int;
  -- traco (Savage Worlds)
  tref jsonb; tname text; ttype text; cdata jsonb; die int; penalty int := 0; untrained boolean := false;
  -- incapacitacao (Vida + Stamina)
  cstate jsonb; ladder int[] := array[4, 6, 8, 10, 12]; vigor int; hp_cur numeric; st_cur numeric;
  hp_lv int := 0; st_lv int := 0; inc_total int := 0; inc_steps int := 0; base_die int; idx int; nxt int;
  wild boolean; target int; t_chain int[]; w_chain int[]; t_total int; w_total int; best int;
  crit boolean; success boolean; raises int; bonus int := 0;
  r public.table_rolls;
begin
  if uid is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if not public.is_member(p_table) then raise exception 'Você não participa desta mesa.'; end if;
  if not public.table_accepts_messages(p_table) then raise exception 'Esta mesa está encerrada.'; end if;
  if p_visibility not in ('public', 'gm') then raise exception 'Visibilidade inválida.'; end if;
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' or pg_column_size(p_spec) > 4000 then
    raise exception 'Rolagem inválida.';
  end if;
  if (select count(*) from public.table_rolls
      where table_id = p_table and user_id = uid and created_at > now() - interval '10 seconds') >= 30 then
    raise exception 'Você está rolando rápido demais.';
  end if;

  kind := p_spec->>'kind';
  modifier := coalesce((p_spec->>'modifier')::int, 0);
  if modifier not between -1000 and 1000 then raise exception 'Modificador fora do limite.'; end if;

  if kind = 'dice' then
    terms := p_spec->'dice';
    if terms is null or jsonb_typeof(terms) <> 'array' or jsonb_array_length(terms) not between 1 and 10 then
      raise exception 'Informe de 1 a 10 grupos de dados.';
    end if;
    mode := coalesce(p_spec->>'mode', 'normal');
    if mode not in ('normal', 'advantage', 'disadvantage') then raise exception 'Modo inválido.'; end if;
    n_attempts := case when mode = 'normal' then 1 else 2 end;

    for term in select * from jsonb_array_elements(terms) loop
      cnt := (term->>'count')::int;
      sides := (term->>'sides')::int;
      if cnt not between 1 and 50 or sides not in (4, 6, 8, 10, 12, 20, 100) then
        raise exception 'Dados inválidos. Use de 1 a 50 dados D4, D6, D8, D10, D12, D20 ou D100.';
      end if;
      total_dice := total_dice + cnt;
    end loop;
    if total_dice > 100 then raise exception 'Dados demais em uma rolagem (máximo 100).'; end if;

    for a in 1..n_attempts loop
      groups := '[]'::jsonb;
      sub := 0;
      for term in select * from jsonb_array_elements(terms) loop
        cnt := (term->>'count')::int;
        sides := (term->>'sides')::int;
        expl := coalesce((term->>'explode')::boolean, false);
        neg := coalesce((term->>'negative')::boolean, false);
        rolled := '[]'::jsonb;
        gsum := 0;
        for i in 1..cnt loop
          vals := public._roll_chain(sides, expl);
          rolled := rolled || jsonb_build_array(to_jsonb(vals));
          gsum := gsum + public._sum_ints(vals);
        end loop;
        groups := groups || jsonb_build_array(jsonb_build_object(
          'sides', sides, 'count', cnt, 'explode', expl, 'negative', neg, 'dice', rolled, 'subtotal', gsum));
        sub := sub + case when neg then -gsum else gsum end;
      end loop;
      attempt_total := sub + modifier;
      totals := totals || attempt_total;
      attempts := attempts || jsonb_build_array(jsonb_build_object('groups', groups, 'subtotal', sub, 'total', attempt_total));
    end loop;

    if mode = 'advantage' and totals[2] > totals[1] then chosen := 2; end if;
    if mode = 'disadvantage' and totals[2] < totals[1] then chosen := 2; end if;
    final_total := totals[chosen];

    for term in select * from jsonb_array_elements(terms) loop
      formula_parts := formula_parts || (
        case when coalesce((term->>'negative')::boolean, false) then '-' when array_length(formula_parts, 1) > 0 then '+' else '' end
        || (term->>'count') || 'd' || (term->>'sides') || case when coalesce((term->>'explode')::boolean, false) then '!' else '' end);
    end loop;
    formula := array_to_string(formula_parts, '')
      || case when modifier > 0 then '+' || modifier when modifier < 0 then modifier::text else '' end
      || case mode when 'advantage' then ' (vantagem)' when 'disadvantage' then ' (desvantagem)' else '' end;
    res := jsonb_build_object('kind', 'dice', 'mode', mode, 'modifier', modifier, 'attempts', attempts, 'chosen', chosen - 1);

  elsif kind = 'trait' then
    if p_character is null or not public.can_edit_state(p_table, p_character) then
      raise exception 'Escolha uma ficha sua vinculada a esta mesa.';
    end if;
    tref := p_spec->'trait';
    if tref is null or jsonb_typeof(tref) <> 'object' then raise exception 'Traço inválido.'; end if;
    ttype := tref->>'type';
    tname := left(coalesce(tref->>'name', ''), 40);
    if ttype not in ('attribute', 'skill') or tname = '' then raise exception 'Traço inválido.'; end if;
    select data into cdata from public.characters where id = p_character;
    if cdata is null then raise exception 'Ficha não encontrada.'; end if;
    -- Incapacitacao: niveis somam (Vida + Stamina). Dados: 0,1,1,2,2 estagios para os totais 0..4.
    select state into cstate from public.table_character_state where table_id = p_table and character_id = p_character;
    vigor := coalesce((cdata->'attributes'->>'Vigor')::int, 0);
    if cstate is not null and vigor > 0 then
      hp_cur := least(vigor, greatest(0, coalesce(nullif(cstate->>'life', '')::numeric, vigor)));
      st_cur := least(vigor, greatest(0, coalesce(nullif(cstate->>'stamina', '')::numeric, vigor)));
      hp_lv := case when hp_cur < vigor * 0.25 then 2 when hp_cur <= vigor / 2.0 then 1 else 0 end;
      st_lv := case when st_cur < vigor * 0.25 then 2 when st_cur <= vigor / 2.0 then 1 else 0 end;
      inc_total := hp_lv + st_lv;
      inc_steps := (array[0, 1, 1, 2, 2])[inc_total + 1];
      if inc_total >= 4 and coalesce((cstate->'faint'->>'fainted')::boolean, false) then
        raise exception 'Este personagem está desmaiado (Incapacitação 5) e não pode rolar.';
      end if;
    end if;

    if ttype = 'attribute' then
      base_die := (cdata->'attributes'->>tname)::int;
      if base_die is null or base_die not in (4, 6, 8, 10, 12) then raise exception 'Atributo inválido.'; end if;
      idx := array_position(ladder, base_die);
    else
      base_die := coalesce((cdata->'skills'->>tname)::int, 0);
      if base_die = 0 then untrained := true; idx := 0;
      elsif base_die not in (4, 6, 8, 10, 12) then raise exception 'Perícia inválida.';
      else idx := array_position(ladder, base_die); end if;
    end if;
    -- Perde `inc_steps` estagios. Atributo nunca abaixo de d4; pericia abaixo de d4 perde 2 por estagio (sem treino ja e d4-2).
    nxt := idx - inc_steps;
    if nxt >= 1 then die := ladder[nxt]; penalty := 0;
    elsif ttype = 'attribute' then die := 4; penalty := 0;
    else die := 4; penalty := -2 * (1 - nxt); end if;
    -- d12+N: o dado-base continua d12 e o bonus soma ao resultado. So vale enquanto o dado nao perdeu estagios.
    bonus := 0;
    if die = 12 and base_die = 12 then
      bonus := least(50, greatest(0, coalesce(nullif(cdata->'bonuses'->(case when ttype = 'attribute' then 'attributes' else 'skills' end)->>tname, '')::int, 0)));
    end if;
    wild := coalesce((p_spec->>'wild')::boolean, true);
    target := coalesce((p_spec->>'target')::int, 4);
    if target not between 2 and 30 then raise exception 'Dificuldade fora do limite.'; end if;

    t_chain := public._roll_chain(die, true);
    t_total := public._sum_ints(t_chain);
    best := t_total;
    if wild then
      w_chain := public._roll_chain(6, true);
      w_total := public._sum_ints(w_chain);
      best := greatest(t_total, w_total);
    end if;
    crit := wild and t_chain[1] = 1 and w_chain[1] = 1;
    final_total := best + penalty + modifier + bonus;
    success := not crit and final_total >= target;
    raises := case when success then (final_total - target) / 4 else 0 end;
    formula := tname || ' d' || die || case when bonus > 0 then '+' || bonus else '' end || case when wild then ' + selvagem d6' else '' end
      || case when penalty <> 0 then penalty::text else '' end
      || case when modifier > 0 then '+' || modifier when modifier < 0 then modifier::text else '' end
      || ' vs ' || target;
    res := jsonb_build_object('kind', 'trait', 'name', tname, 'type', ttype, 'die', die, 'untrained', untrained,
      'wild', wild, 'traitRolls', to_jsonb(t_chain), 'traitTotal', t_total,
      'wildRolls', case when wild then to_jsonb(w_chain) end, 'wildTotal', w_total,
      'penalty', penalty, 'bonus', bonus, 'modifier', modifier, 'target', target,
      'criticalFailure', crit, 'success', success, 'raises', raises,
      'incap', jsonb_build_object('total', inc_total, 'steps', inc_steps, 'baseDie', base_die));
  else
    raise exception 'Tipo de rolagem inválido.';
  end if;

  insert into public.table_rolls (table_id, user_id, character_id, label, formula, spec, result, total, visibility)
  values (p_table, uid, case when kind = 'trait' then p_character end, left(coalesce(p_label, ''), 100),
          formula, p_spec, res, final_total, p_visibility)
  returning * into r;
  return r;
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value or datatype_mismatch then
    raise exception 'Rolagem inválida.';
end $$;
