-- Sistema de Aptidão.
--
--  1) aptitude_grants: cada rolagem de 1d100 concedida pelo mestre (resultado = pontos). Sorteada no servidor, com
--     chave de idempotência (request_id): repetir o mesmo pedido por falha de conexão devolve a mesma rolagem.
--  2) character_aptitude: a distribuição confirmada pelo jogador (pontos por atributo e perícia) e aptitude_log com o
--     histórico de cada mudança. O servidor confere que o total distribuído nunca passa do total recebido.
--  3) advance_time passa a aplicar a Aptidão ao gravar o XP: ganho × (1 + bônus) uma única vez por evento e só ao alvo
--     direto, e o limite de acúmulo de cada alvo = 5.000 × (1 + bônus). Atributo: +10% por ponto; perícia: +5% por
--     ponto; máximo de +100% por alvo (XP e limite). Feitiços não têm Aptidão.
--     Mudar a distribuição NUNCA mexe na XP já conquistada: se o limite cair abaixo do que já foi acumulado, nada é
--     apagado, só novos ganhos ficam bloqueados até a XP disponível voltar a ficar abaixo do limite.
--
-- Rode depois da 0025. Pode rodar de novo sem estragar nada.

create table if not exists public.aptitude_grants (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  roll int not null check (roll between 1 and 100),
  request_id uuid not null,
  granted_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (table_id, request_id)
);
create index if not exists aptitude_grants_char_idx on public.aptitude_grants (table_id, character_id, created_at desc);
alter table public.aptitude_grants enable row level security;
drop policy if exists "aptitude_grants_select" on public.aptitude_grants;
create policy "aptitude_grants_select" on public.aptitude_grants for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));
do $$ begin alter publication supabase_realtime add table public.aptitude_grants; exception when duplicate_object then null; end $$;

create table if not exists public.character_aptitude (
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  allocation jsonb not null default '{}'::jsonb check (jsonb_typeof(allocation) = 'object' and pg_column_size(allocation) < 8192),
  revision int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (table_id, character_id)
);
alter table public.character_aptitude enable row level security;
drop policy if exists "character_aptitude_select" on public.character_aptitude;
create policy "character_aptitude_select" on public.character_aptitude for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));

create table if not exists public.aptitude_log (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  before_alloc jsonb not null,
  after_alloc jsonb not null,
  points_received int not null,
  created_at timestamptz not null default now()
);
create index if not exists aptitude_log_char_idx on public.aptitude_log (table_id, character_id, id desc);
alter table public.aptitude_log enable row level security;
drop policy if exists "aptitude_log_select" on public.aptitude_log;
create policy "aptitude_log_select" on public.aptitude_log for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));

-- Bônus em % (0 a 100) de um alvo na distribuição. Atributo 10 por ponto, perícia 5 por ponto, máximo 100.
create or replace function public.aptitude_pct(alloc jsonb, p_kind text, p_name text) returns numeric
language sql immutable as $$
  select least(100, greatest(0, coalesce((alloc ->> (p_kind || ':' || p_name))::numeric, 0))
    * case p_kind when 'attribute' then 10 when 'skill' then 5 else 0 end);
$$;

-- Total de pontos recebidos (soma das rolagens).
create or replace function public.aptitude_received(p_table uuid, p_character uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(sum(roll), 0)::int from public.aptitude_grants where table_id = p_table and character_id = p_character;
$$;

-- Mestre: concede uma rolagem de Aptidão (1d100). O resultado é sorteado aqui e gravado uma única vez; o mesmo
-- p_request repetido (clique duplo, falha de conexão) devolve a rolagem que já existe em vez de sortear outra.
create or replace function public.grant_aptitude(p_table uuid, p_character uuid, p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare g public.aptitude_grants; fresh boolean := true;
begin
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode conceder Aptidão.'; end if;
  if not public.table_accepts_messages(p_table) then raise exception 'Esta mesa está encerrada.'; end if;
  if p_request is null then raise exception 'Pedido inválido.'; end if;
  if not exists (select 1 from public.table_members where table_id = p_table and character_id = p_character and status = 'approved') then
    raise exception 'Esta ficha não está vinculada a um jogador da mesa.';
  end if;
  insert into public.aptitude_grants (table_id, character_id, roll, request_id)
  values (p_table, p_character, 1 + floor(random() * 100)::int, p_request)
  on conflict (table_id, request_id) do nothing
  returning * into g;
  if g.id is null then
    fresh := false;
    select * into g from public.aptitude_grants where table_id = p_table and request_id = p_request;
    if g.character_id <> p_character then raise exception 'Este pedido já foi usado para outro personagem.'; end if;
  end if;
  return jsonb_build_object('id', g.id, 'roll', g.roll, 'fresh', fresh, 'received', public.aptitude_received(p_table, p_character), 'at', g.created_at);
end $$;

-- Jogador: confirma a distribuição dos pontos (substitui a distribuição anterior). Só o dono da ficha, só alvos que
-- existem na ficha (atributos; perícias treinadas) e nunca mais pontos do que recebeu. Não mexe na XP já conquistada.
create or replace function public.set_aptitude(p_table uuid, p_character uuid, p_allocation jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cdata jsonb; k text; v numeric; kind_x text; name_x text; clean jsonb := '{}'::jsonb; total int := 0; received int;
  cur public.character_aptitude; n int := 0;
begin
  if not public.owns_character(p_character) or not public.my_character_in(p_table, p_character) then raise exception 'Esta ficha não é sua nesta mesa.'; end if;
  if not public.table_accepts_messages(p_table) then raise exception 'Esta mesa está encerrada.'; end if;
  if p_allocation is null or jsonb_typeof(p_allocation) <> 'object' then raise exception 'Distribuição inválida.'; end if;
  select data into cdata from public.characters where id = p_character;
  for k in select jk from jsonb_object_keys(p_allocation) jk loop
    n := n + 1;
    if n > 200 then raise exception 'Distribuição inválida.'; end if;
    if jsonb_typeof(p_allocation -> k) <> 'number' then raise exception 'Valor inválido em %.', k; end if;
    v := (p_allocation ->> k)::numeric;
    if v <> trunc(v) or v < 0 or v > 1000 then raise exception 'Pontos inválidos em % (inteiro de 0 a 1000).', k; end if;
    if v = 0 then continue; end if;
    kind_x := split_part(k, ':', 1);
    name_x := substr(k, length(kind_x) + 2);
    if kind_x = 'attribute' then
      if (cdata -> 'attributes' ->> name_x) is null then raise exception 'O atributo % não existe na ficha.', name_x; end if;
    elsif kind_x = 'skill' then
      if coalesce((cdata -> 'skills' ->> name_x)::int, 0) <= 0 then raise exception 'A perícia % não existe na ficha.', name_x; end if;
    else
      raise exception 'Só atributos e perícias recebem Aptidão.';
    end if;
    clean := jsonb_set(clean, array[k], to_jsonb(v::int));
    total := total + v::int;
  end loop;
  received := public.aptitude_received(p_table, p_character);
  if total > received then raise exception 'Você distribuiu % pontos, mas só recebeu %.', total, received; end if;
  insert into public.character_aptitude (table_id, character_id) values (p_table, p_character) on conflict do nothing;
  select * into cur from public.character_aptitude where table_id = p_table and character_id = p_character for update;
  if cur.allocation is distinct from clean then
    update public.character_aptitude set allocation = clean, revision = revision + 1, updated_at = now() where table_id = p_table and character_id = p_character;
    insert into public.aptitude_log (table_id, character_id, before_alloc, after_alloc, points_received) values (p_table, p_character, cur.allocation, clean, received);
  end if;
  return jsonb_build_object('allocation', clean, 'received', received, 'distributed', total, 'available', received - total);
end $$;

revoke all on function public.aptitude_pct(jsonb, text, text) from public, anon;
revoke all on function public.aptitude_received(uuid, uuid) from public, anon;
revoke all on function public.grant_aptitude(uuid, uuid, uuid) from public, anon;
revoke all on function public.set_aptitude(uuid, uuid, jsonb) from public, anon;

-- advance_time com Aptidão (copia da 0025; muda só o trecho que grava o XP).
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
  s_min numeric; m_min numeric; xp_max numeric; jr record; is_work boolean; pays jsonb := '{}'::jsonb;
  alloc jsonb; pct numeric; base_amt numeric;
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
    s_min := -8; m_min := -2; xp_max := 1; is_work := false;
    select * into jr from public.routine_requests where false; -- registro sempre atribuído (evita erro ao ler campos de um registro vazio)
    if coalesce(ev ->> 'activity', '') = 'trabalhar' and coalesce((ev ->> 'ok')::boolean, true) then
      -- Trabalhar: o trabalho precisa estar aprovado e ser desta ficha; custos e XP nunca passam do que o mestre configurou.
      select * into jr from public.routine_requests where id = nullif(ev -> 'row' ->> 'job', '')::uuid;
      if not found or jr.kind <> 'work' or jr.status <> 'approved' or jr.character_id <> ch then
        raise exception 'Trabalho não aprovado para este personagem (tick %).', t;
      end if;
      is_work := true;
      s_min := -(select max(v::numeric) from jsonb_array_elements_text(jr.config -> 'staminaTiers') v);
      m_min := -(select max(v::numeric) from jsonb_array_elements_text(jr.config -> 'manaTiers') v);
      xp_max := coalesce((jr.config ->> 'xp')::numeric, 0);
    end if;
    if s_d < s_min or s_d > 6 or m_d < m_min or m_d > 1 then raise exception 'Evento fora dos limites das regras (tick %).', t; end if;
    if char_length(coalesce(ev ->> 'activity', '')) > 40 or char_length(coalesce(ev ->> 'reason', '')) > 300 then raise exception 'Evento inválido.'; end if;
    if jsonb_typeof(coalesce(ev -> 'xp', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(ev -> 'xp', '[]'::jsonb)) > 6 then raise exception 'XP inválido.'; end if;
    for xe in select x from jsonb_array_elements(coalesce(ev -> 'xp', '[]'::jsonb)) x loop
      amt := (xe ->> 'amount')::numeric;
      if amt is null or amt <= 0 or amt > xp_max or (xe ->> 'kind') not in ('skill', 'attribute', 'spell')
         or (xe ->> 'modality') not in ('normal', 'focused') or char_length(coalesce(xe ->> 'name', '')) not between 1 and 64 then
        raise exception 'XP inválido.';
      end if;
    end loop;

    select m.user_id into own_id from public.table_members m where m.table_id = p_table and m.character_id = ch and m.status = 'approved';
    select coalesce(tr.name, '') into rname from public.table_training tr where tr.id = nullif(ev ->> 'routineId', '')::uuid;
    mx := p_days -> (ch::text) -> 'max';
    detail := jsonb_strip_nulls(jsonb_build_object(
      'rest', ev -> 'rest', 'meditation', ev -> 'meditation', 'cost', ev -> 'cost', 'trainHour', ev -> 'trainHour',
      'study', ev -> 'study', 'spell', ev -> 'spell', 'job', ev -> 'row' -> 'job', 'pay', case when is_work then to_jsonb((jr.config ->> 'pay')::int) end));

    insert into public.table_routine_runs (table_id, character_id, user_id, tick, day_no, slot, routine_id, routine_name, row_snapshot,
      activity, ok, reason, stamina_delta, mana_delta, detail)
    values (p_table, ch, own_id, t, (ev ->> 'dayNo')::int, (ev ->> 'slot')::int, nullif(ev ->> 'routineId', '')::uuid, coalesce(rname, ''),
      coalesce(ev -> 'row', '{}'::jsonb), coalesce(ev ->> 'activity', ''), coalesce((ev ->> 'ok')::boolean, true), coalesce(ev ->> 'reason', ''),
      s_d, m_d, detail)
    on conflict (table_id, character_id, tick) do nothing;

    if found then
      if is_work then
        pays := jsonb_set(pays, array[ch::text], to_jsonb(coalesce((pays ->> ch::text)::numeric, 0) + coalesce((jr.config ->> 'pay')::numeric, 0)));
      end if;
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
      select allocation into alloc from public.character_aptitude where table_id = p_table and character_id = ch;
      alloc := coalesce(alloc, '{}'::jsonb);
      xr := '[]'::jsonb;
      for xe in select x from jsonb_array_elements(coalesce(ev -> 'xp', '[]'::jsonb)) x loop
        amt := (xe ->> 'amount')::numeric; kind_x := xe ->> 'kind'; name_x := xe ->> 'name'; mod_x := xe ->> 'modality';
        -- Aptidão: bônus só do alvo direto (perícia ou atributo), aplicado uma única vez sobre o ganho-base do evento.
        base_amt := amt;
        pct := case when kind_x in ('skill', 'attribute') then public.aptitude_pct(alloc, kind_x, name_x) else 0 end;
        amt := amt * (1 + pct / 100);
        select * into pool from public.character_progress
          where table_id = p_table and character_id = ch and kind = kind_x and name = name_x and modality = mod_x for update;
        old_av := coalesce(pool.available, 0);
        cap_x := 5000 * (1 + pct / 100); -- limite de acúmulo deste alvo; se caiu abaixo do que já há, só bloqueia novos ganhos
        kept := greatest(0, least(amt, cap_x - old_av));
        insert into public.character_progress (table_id, character_id, kind, name, modality, available, earned_total, discarded_total, cap)
        values (p_table, ch, kind_x, name_x, mod_x, kept, amt, amt - kept, cap_x)
        on conflict (table_id, character_id, kind, name, modality) do update set
          available = public.character_progress.available + kept,
          earned_total = public.character_progress.earned_total + amt,
          discarded_total = public.character_progress.discarded_total + (amt - kept),
          cap = cap_x,
          updated_at = now();
        select * into pool from public.character_progress
          where table_id = p_table and character_id = ch and kind = kind_x and name = name_x and modality = mod_x;
        xr := xr || jsonb_build_object('kind', kind_x, 'name', name_x, 'modality', mod_x, 'amount', amt, 'base', base_amt, 'bonusPct', pct, 'kept', kept, 'discarded', amt - kept,
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

  -- Salario do trabalho: uma concessao por personagem neste avanco (o app do jogador soma na ficha, como o dinheiro do mestre).
  for day_item in select key as k, value as v from jsonb_each(pays) loop
    if (day_item.v #>> '{}')::numeric > 0 then
      insert into public.money_awards (table_id, character_id, amount, note)
      values (p_table, day_item.k::uuid, least(1000000, (day_item.v #>> '{}')::numeric)::int, 'Salário de trabalho');
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
