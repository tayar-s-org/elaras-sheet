-- A rotina nunca deixa a estamina abaixo de 1: o servidor tambem limita o gasto (copia da advance_time da 0026; muda so a linha da estamina).

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
      -- Gasto da rotina nunca deixa a estamina abaixo de 1 (se ja estava abaixo, um gasto nao muda nada); recuperacao segue normal.
      new_s := least(mx_s, greatest(case when s_d < 0 then least(cur_s, 1) else 0 end, cur_s + s_d));
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
