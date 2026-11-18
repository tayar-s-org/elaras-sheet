-- Fase 4 do novo sistema de rotinas: trabalho com aprovacao do mestre, Estudo Magico e melhoria de feitiços.
--
--  1) routine_requests: sugestoes dos jogadores (trabalho ou melhoria de feitiço). So o mestre aprova, rejeita ou pede
--     alteracoes e define a configuracao (custos por faixa de horas, pagamento, XP, perícia; descricao e custo de XP da melhoria).
--  2) advance_time passa a processar Trabalhar: confere que o trabalho esta aprovado e é DESTA ficha, limita custos e XP ao
--     que o mestre configurou e paga o salario por hora (money_awards). O pagamento sai da configuracao no servidor, nao do cliente.
--  3) Estudo Magico: dados de Astucia (25 h = 1, maximo 24), tentativa de aprimorar o feitiço no servidor
--     (attempt_spell_upgrade: 16 dados, dificuldade, Pity por feitiço), tentativas gravadas para auditoria.
--     O custo de XP definido pelo mestre é GUARDADO e exibido, mas NAO é cobrado (quando cobrar ainda nao foi decidido).
--  4) A melhoria conquistada chega na ficha do jogador por uma fila (spell_upgrade_awards), como o XP e a evolucao.
--
-- Rode depois da 0024. Pode rodar de novo sem estragar nada.

alter table public.character_training add column if not exists astucia_dice_spent int not null default 0 check (astucia_dice_spent >= 0);

-- 1) Solicitacoes.
create table if not exists public.routine_requests (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('work', 'spell_study')),
  title text not null default '' check (char_length(title) <= 80),
  body text not null default '' check (char_length(body) between 1 and 2000),
  spell_id text check (spell_id is null or char_length(spell_id) between 1 and 64),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'changes', 'done')),
  gm_note text check (gm_note is null or char_length(gm_note) <= 500),
  config jsonb not null default '{}'::jsonb check (pg_column_size(config) < 4096),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists routine_requests_char_idx on public.routine_requests (table_id, character_id);
alter table public.routine_requests enable row level security;

drop policy if exists "requests_select" on public.routine_requests;
create policy "requests_select" on public.routine_requests for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));
drop policy if exists "requests_insert" on public.routine_requests;
create policy "requests_insert" on public.routine_requests for insert to authenticated
  with check (user_id = auth.uid() and public.my_character_in(table_id, character_id) and public.table_accepts_messages(table_id));
drop policy if exists "requests_update" on public.routine_requests;
create policy "requests_update" on public.routine_requests for update to authenticated
  using (public.is_gm(table_id) or (public.owns_character(character_id) and public.my_character_in(table_id, character_id)))
  with check (public.is_gm(table_id) or (public.owns_character(character_id) and public.my_character_in(table_id, character_id)));
drop policy if exists "requests_delete" on public.routine_requests;
create policy "requests_delete" on public.routine_requests for delete to authenticated
  using (user_id = auth.uid() and status <> 'done');

-- Configuracao do mestre valida. Trabalho: nome, 3 faixas de estamina e de mana (horas 1-4, 5-8, 9-12), pagamento por hora,
-- XP por hora e a perícia que recebe o XP. Melhoria: descricao do que muda (vai para a ficha) e custo de XP (opcional).
create or replace function public.request_config_ok(p_kind text, cfg jsonb, p_body text) returns jsonb
language plpgsql immutable as $$
declare out jsonb; t jsonb; v numeric;
begin
  if p_kind = 'work' then
    if char_length(btrim(coalesce(cfg ->> 'name', ''))) not between 1 and 60 then raise exception 'Dê um nome ao trabalho.'; end if;
    for t in select x from jsonb_array_elements(jsonb_build_array(coalesce(cfg -> 'staminaTiers', 'null'::jsonb), coalesce(cfg -> 'manaTiers', 'null'::jsonb))) x loop
      if jsonb_typeof(t) <> 'array' or jsonb_array_length(t) <> 3 then raise exception 'Informe os custos das 3 faixas de horas.'; end if;
      for v in select (e)::numeric from jsonb_array_elements_text(t) e loop
        if v < 0 or v > 50 or v <> trunc(v) then raise exception 'Custo por faixa deve ser um inteiro de 0 a 50.'; end if;
      end loop;
    end loop;
    v := coalesce((cfg ->> 'pay')::numeric, 0);
    if v < 0 or v > 4000 or v <> trunc(v) then raise exception 'Pagamento por hora: inteiro de 0 a 4000.'; end if;
    v := coalesce((cfg ->> 'xp')::numeric, 0);
    if v < 0 or v > 10 then raise exception 'XP por hora: de 0 a 10.'; end if;
    if v > 0 and char_length(btrim(coalesce(cfg ->> 'xpSkill', ''))) not between 1 and 60 then raise exception 'Escolha a perícia que recebe o XP.'; end if;
    out := jsonb_build_object('name', btrim(cfg ->> 'name'), 'description', left(coalesce(cfg ->> 'description', ''), 1000),
      'staminaTiers', cfg -> 'staminaTiers', 'manaTiers', cfg -> 'manaTiers', 'pay', coalesce((cfg ->> 'pay')::int, 0),
      'xp', coalesce((cfg ->> 'xp')::numeric, 0), 'xpSkill', coalesce(btrim(cfg ->> 'xpSkill'), ''));
  else
    v := coalesce(nullif(cfg ->> 'xp_cost', '')::numeric, 0);
    if v < 0 or v > 1000000 or v <> trunc(v) then raise exception 'Custo de XP: inteiro de 0 a 1.000.000.'; end if;
    out := jsonb_build_object('description', left(coalesce(nullif(btrim(cfg ->> 'description'), ''), p_body), 2000), 'xp_cost', v);
  end if;
  return out;
end $$;

create or replace function public.request_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare gm boolean := public.is_gm(coalesce(new.table_id, old.table_id)); is_owner boolean; texts boolean;
begin
  if tg_op = 'INSERT' then
    if new.kind = 'spell_study' then
      if new.spell_id is null or not exists (
        select 1 from public.character_progress p where p.table_id = new.table_id and p.character_id = new.character_id
          and p.kind = 'spell' and p.name = new.spell_id and p.earned_total > 0
      ) then raise exception 'Só dá para estudar um feitiço que já passou pelo treinamento de feitiço.'; end if;
    else
      new.spell_id := null;
    end if;
    if (select count(*) from public.routine_requests r where r.table_id = new.table_id and r.character_id = new.character_id) >= 40 then
      raise exception 'Limite de 40 solicitações por personagem. Apague as antigas.';
    end if;
    new.status := 'pending'; new.config := '{}'::jsonb; new.gm_note := null; new.decided_at := null;
    new.updated_at := now();
    return new;
  end if;
  -- Operacoes internas (a tentativa de aprimorar conclui a solicitacao) passam sem as travas abaixo.
  if current_setting('elara.internal', true) = '1' then new.updated_at := now(); return new; end if;
  new.id := old.id; new.table_id := old.table_id; new.character_id := old.character_id; new.user_id := old.user_id;
  new.kind := old.kind; new.created_at := old.created_at;
  if old.status = 'done' then return old; end if;
  is_owner := auth.uid() = old.user_id;
  if not is_owner and not gm then return old; end if;
  texts := new.title is distinct from old.title or new.body is distinct from old.body or new.spell_id is distinct from old.spell_id;
  if not is_owner then new.title := old.title; new.body := old.body; new.spell_id := old.spell_id; texts := false; end if;
  if old.kind = 'work' then new.spell_id := null; else new.spell_id := old.spell_id; end if;
  if not gm then new.status := old.status; new.config := old.config; new.gm_note := old.gm_note; new.decided_at := old.decided_at; end if;
  if texts then
    -- O jogador mudou o texto: o mestre precisa ver de novo (a configuracao anterior fica guardada).
    if not (gm and new.status is distinct from old.status) then new.status := 'pending'; new.decided_at := null; new.gm_note := null; end if;
  end if;
  if gm and new.status = 'approved' then new.config := public.request_config_ok(old.kind, new.config, new.body); end if;
  if gm and new.status is distinct from old.status then
    if new.status = 'done' then new.status := old.status; end if;
    new.decided_at := case when new.status = 'pending' then null else now() end;
    if new.status = 'approved' then new.gm_note := null; else new.gm_note := nullif(btrim(new.gm_note), ''); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists request_guard on public.routine_requests;
create trigger request_guard before insert or update on public.routine_requests
  for each row execute function public.request_guard();

-- 3) Pity e melhorias por feitiço; tentativas para auditoria.
create table if not exists public.spell_progress (
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  spell_id text not null,
  pity int not null default 0 check (pity between 0 and 5),
  improvements int not null default 0 check (improvements between 0 and 10),
  updated_at timestamptz not null default now(),
  primary key (table_id, character_id, spell_id)
);
alter table public.spell_progress enable row level security;
drop policy if exists "spell_progress_select" on public.spell_progress;
create policy "spell_progress_select" on public.spell_progress for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));

create table if not exists public.spell_attempts (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  request_id uuid references public.routine_requests(id) on delete set null,
  spell_id text not null,
  improvement_no int not null,
  rolls int[] not null,
  die int not null,
  bonus int not null default 0,
  total int not null,
  required_base int not null,
  required_effective numeric not null,
  pity_before int not null,
  pity_after int not null,
  success boolean not null,
  dice_spent int not null default 16,
  xp_cost_shown numeric,
  created_at timestamptz not null default now()
);
create index if not exists spell_attempts_char_idx on public.spell_attempts (table_id, character_id, id desc);
alter table public.spell_attempts enable row level security;
drop policy if exists "spell_attempts_select" on public.spell_attempts;
create policy "spell_attempts_select" on public.spell_attempts for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));

create table if not exists public.spell_upgrade_awards (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  spell_id text not null,
  n int not null,
  description text not null check (char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists spell_upgrade_awards_pending_idx on public.spell_upgrade_awards (character_id) where claimed_at is null;
alter table public.spell_upgrade_awards enable row level security;
drop policy if exists "spell_upgrade_awards_select" on public.spell_upgrade_awards;
create policy "spell_upgrade_awards_select" on public.spell_upgrade_awards for select to authenticated
  using (public.is_gm(table_id) or public.owns_character(character_id));
do $$ begin alter publication supabase_realtime add table public.spell_upgrade_awards; exception when duplicate_object then null; end $$;

-- Dificuldade da melhoria pelo numero de melhorias que o feitiço ja tem (1ª = 150 ... 10ª = 5.770).
create or replace function public.upgrade_difficulty(n int) returns int
language sql immutable as $$
  select (array[150, 225, 340, 510, 760, 1140, 1710, 2565, 3845, 5770])[n];
$$;

-- Tentar aprimorar o feitiço de uma solicitacao APROVADA pelo mestre. Precisa de pelo menos 16 dados de Astucia
-- disponiveis (25 h de estudo = 1 dado, maximo 24 acumulados). Rola 16 dados do tipo de Astucia da ficha (cada um com o
-- bonus de d12+N), soma e compara com a dificuldade, reduzida em 10% por ponto de Pity. A tentativa gasta os 16 dados.
-- Sucesso: aplica a melhoria e zera o Pity. Falha com pelo menos 50% do valor da tabela: +1 de Pity (maximo 5).
create or replace function public.attempt_spell_upgrade(p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rq record; cdata jsonb; adie int; abonus int := 0; tr record; sp record;
  total_dice int; avail int; n_done int; base_req int; eff numeric; pity_b int; pity_a int;
  rolls int[] := '{}'; i int; face int; sum_total int := 0; ok boolean; desc_text text; cost numeric;
begin
  select * into rq from public.routine_requests where id = p_request for update;
  if not found or rq.kind <> 'spell_study' then raise exception 'Solicitação não encontrada.'; end if;
  if not public.owns_character(rq.character_id) or not public.my_character_in(rq.table_id, rq.character_id) then raise exception 'Esta ficha não é sua nesta mesa.'; end if;
  if rq.status <> 'approved' then raise exception 'O mestre precisa aprovar a melhoria antes da tentativa.'; end if;
  if not public.table_accepts_messages(rq.table_id) then raise exception 'Esta mesa está encerrada.'; end if;
  select data into cdata from public.characters where id = rq.character_id;
  adie := coalesce((cdata -> 'attributes' ->> 'Astúcia')::int, 0);
  if adie not in (4, 6, 8, 10, 12) then raise exception 'Astúcia inválida na ficha.'; end if;
  if adie = 12 then abonus := least(50, greatest(0, coalesce((cdata -> 'bonuses' -> 'attributes' ->> 'Astúcia')::int, 0))); end if;
  insert into public.character_training (table_id, character_id) values (rq.table_id, rq.character_id) on conflict do nothing;
  select * into tr from public.character_training where table_id = rq.table_id and character_id = rq.character_id for update;
  total_dice := least(24, floor(tr.study_hours / 25))::int;
  avail := total_dice - tr.astucia_dice_spent;
  if avail < 16 then raise exception 'Você precisa de pelo menos 16 dados de Astúcia (tem %). Cada 25 horas de Estudo Mágico dão 1 dado.', avail; end if;
  insert into public.spell_progress (table_id, character_id, spell_id) values (rq.table_id, rq.character_id, rq.spell_id) on conflict do nothing;
  select * into sp from public.spell_progress where table_id = rq.table_id and character_id = rq.character_id and spell_id = rq.spell_id for update;
  n_done := sp.improvements;
  if n_done >= 10 then raise exception 'Este feitiço já tem o máximo de 10 melhorias.'; end if;
  base_req := public.upgrade_difficulty(n_done + 1);
  pity_b := sp.pity;
  eff := base_req * (100 - 10 * pity_b) / 100.0;
  for i in 1..16 loop
    face := 1 + floor(random() * adie)::int;
    rolls := rolls || face;
    sum_total := sum_total + face + abonus;
  end loop;
  ok := sum_total > eff;
  pity_a := case when ok then 0 when sum_total >= base_req * 0.5 then least(5, pity_b + 1) else pity_b end;
  cost := nullif(rq.config ->> 'xp_cost', '')::numeric;
  update public.character_training set astucia_dice_spent = astucia_dice_spent + 16, updated_at = now()
    where table_id = rq.table_id and character_id = rq.character_id;
  update public.spell_progress set pity = pity_a, improvements = improvements + case when ok then 1 else 0 end, updated_at = now()
    where table_id = rq.table_id and character_id = rq.character_id and spell_id = rq.spell_id;
  insert into public.spell_attempts (table_id, character_id, request_id, spell_id, improvement_no, rolls, die, bonus, total, required_base,
    required_effective, pity_before, pity_after, success, xp_cost_shown)
  values (rq.table_id, rq.character_id, rq.id, rq.spell_id, n_done + 1, rolls, adie, abonus, sum_total, base_req, eff, pity_b, pity_a, ok, cost);
  if ok then
    desc_text := coalesce(nullif(btrim(rq.config ->> 'description'), ''), rq.body);
    insert into public.spell_upgrade_awards (table_id, character_id, spell_id, n, description) values (rq.table_id, rq.character_id, rq.spell_id, n_done + 1, left(desc_text, 2000));
    perform set_config('elara.internal', '1', true);
    update public.routine_requests set status = 'done' where id = rq.id;
    perform set_config('elara.internal', '0', true);
  end if;
  return jsonb_build_object('success', ok, 'rolls', to_jsonb(rolls), 'die', adie, 'bonus', abonus, 'total', sum_total,
    'requiredBase', base_req, 'requiredEffective', eff, 'pityBefore', pity_b, 'pityAfter', pity_a, 'improvementNo', n_done + 1,
    'diceLeft', avail - 16, 'xpCost', cost);
end $$;

create or replace function public.claim_spell_upgrades(p_character uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare out jsonb;
begin
  if not public.owns_character(p_character) then raise exception 'Ficha inválida.'; end if;
  with taken as (
    update public.spell_upgrade_awards set claimed_at = now()
    where character_id = p_character and claimed_at is null
    returning spell_id, n, description, created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('spell_id', spell_id, 'n', n, 'description', description, 'at', to_char(created_at, 'YYYY-MM-DD')) order by created_at), '[]'::jsonb)
  into out from taken;
  return out;
end $$;
revoke all on function public.attempt_spell_upgrade(uuid) from public, anon;
revoke all on function public.claim_spell_upgrades(uuid) from public, anon;
revoke all on function public.request_config_ok(text, jsonb, text) from public, anon;
revoke all on function public.upgrade_difficulty(int) from public, anon;

-- 2) advance_time com Trabalhar (copia da 0024 com a verificacao do trabalho e o pagamento).
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
