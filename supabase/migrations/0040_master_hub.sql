-- 0040: Central de Controle do Mestre — histórico administrativo, moedas e carteiras, tipos de experiência (contadores),
-- condições dos personagens e os RPCs de administração (dinheiro/XP exatos, entrega de itens com histórico).
--
-- Documentação completa: src/features/room/masterHub/README.md.
--
-- Princípios (todos checados AQUI, no servidor, não só na interface):
--  * só o mestre da mesa (is_gm) executa os RPCs gm_*; o personagem alvo precisa ser membro APROVADO da mesa;
--  * cada RPC recebe p_request_id (uuid, um por alvo) e é IDEMPOTENTE: o mesmo id devolve o resultado gravado (replayed=true)
--    sem aplicar de novo; uma trava consultiva por request_id serializa reenvios simultâneos;
--  * cada RPC grava uma linha em master_audit_log NA MESMA TRANSAÇÃO, com os valores lidos sob lock (antes/depois);
--  * dinheiro e XP continuam em characters.data (mesma fonte da ficha) e geram money_awards/xp_awards como grant_money/grant_xp,
--    então a ficha aberta reconcilia pelo caminho que já existe (useRewardSync + sheetRebase.js). grant_money, grant_xp e
--    gm_give_item NÃO são reescritas (continuam valendo para o app antigo);
--  * carteira e contadores NÃO ficam em characters.data (nada a reconciliar na ficha): tabelas próprias, leitura só do dono do
--    personagem e do mestre, escrita só pelos RPCs; FKs compostas amarram moeda/tipo à mesma mesa;
--  * condições dos personagens ficam em table_character_state.state.conditions, escritas só por gm_set_conditions; um gatilho
--    preserva essa chave contra qualquer outra escrita (jogador, PartyPanel, upsert do PostgREST, funções da rotina).
--
-- Só cria coisas novas (tabelas, funções, política, gatilho); pode ser repetida.
-- ORDEM: aplique esta migração e valide (scripts/masterHubDbTest.mjs) ANTES de publicar o app que usa a Central.

-- ---------- histórico administrativo ----------
create table if not exists public.master_audit_log (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  actor_id uuid default auth.uid() references public.profiles(id) on delete set null,
  character_id uuid references public.characters(id) on delete set null,
  category text not null check (category in ('money', 'xp', 'item', 'wallet', 'currency', 'experience', 'condition')),
  kind text not null check (char_length(kind) between 1 and 40),
  summary text not null default '' check (char_length(summary) <= 300),
  before jsonb,
  after jsonb,
  note text not null default '' check (char_length(note) <= 200),
  request_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists master_audit_table_idx on public.master_audit_log (table_id, created_at desc, id);
create index if not exists master_audit_character_idx on public.master_audit_log (table_id, character_id, created_at desc);
-- Uma operação por (request_id, personagem): é a garantia de banco da idempotência.
create unique index if not exists master_audit_request_idx on public.master_audit_log
  (request_id, coalesce(character_id, '00000000-0000-0000-0000-000000000000'::uuid)) where request_id is not null;
alter table public.master_audit_log enable row level security;
drop policy if exists master_audit_select on public.master_audit_log;
create policy master_audit_select on public.master_audit_log for select to authenticated using (public.is_gm(table_id));
revoke all on public.master_audit_log from anon;
grant select on public.master_audit_log to authenticated;

-- ---------- moedas e carteiras ----------
create table if not exists public.table_currencies (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  symbol text not null default '¤' check (char_length(symbol) between 1 and 8),
  description text not null default '' check (char_length(description) <= 300),
  rate numeric check (rate is null or (rate > 0 and rate <= 1000000000)), -- referência informativa (valor em $); não há conversão automática
  created_at timestamptz not null default now(),
  unique (table_id, id)
);
create unique index if not exists table_currencies_name_idx on public.table_currencies (table_id, lower(name));

create table if not exists public.character_wallets (
  table_id uuid not null,
  character_id uuid not null references public.characters(id) on delete cascade,
  currency_id uuid not null,
  amount bigint not null default 0 check (amount between 0 and 999999999),
  updated_at timestamptz not null default now(),
  primary key (character_id, currency_id),
  foreign key (table_id, currency_id) references public.table_currencies (table_id, id) on delete cascade
);
create index if not exists character_wallets_table_idx on public.character_wallets (table_id);

-- ---------- tipos de experiência (contadores nomeados; NÃO mexem em XP nem em nível) ----------
create table if not exists public.table_experience_types (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  description text not null default '' check (char_length(description) <= 300),
  icon text not null default '★' check (char_length(icon) between 1 and 8),
  category text not null default '' check (char_length(category) <= 30),
  created_at timestamptz not null default now(),
  unique (table_id, id)
);
create unique index if not exists table_experience_types_name_idx on public.table_experience_types (table_id, lower(name));

create table if not exists public.character_experience (
  table_id uuid not null,
  character_id uuid not null references public.characters(id) on delete cascade,
  type_id uuid not null,
  amount bigint not null default 0 check (amount between 0 and 1000000),
  updated_at timestamptz not null default now(),
  primary key (character_id, type_id),
  foreign key (table_id, type_id) references public.table_experience_types (table_id, id) on delete cascade
);
create index if not exists character_experience_table_idx on public.character_experience (table_id);

-- Leitura: definições para todos da mesa (o dono precisa de nome/símbolo/ícone); saldos só do dono do personagem e do mestre.
alter table public.table_currencies enable row level security;
alter table public.character_wallets enable row level security;
alter table public.table_experience_types enable row level security;
alter table public.character_experience enable row level security;
drop policy if exists currencies_select on public.table_currencies;
create policy currencies_select on public.table_currencies for select to authenticated using (public.is_member(table_id));
drop policy if exists wallets_select on public.character_wallets;
create policy wallets_select on public.character_wallets for select to authenticated using (public.is_gm(table_id) or public.owns_character(character_id));
drop policy if exists exp_types_select on public.table_experience_types;
create policy exp_types_select on public.table_experience_types for select to authenticated using (public.is_member(table_id));
drop policy if exists experience_select on public.character_experience;
create policy experience_select on public.character_experience for select to authenticated using (public.is_gm(table_id) or public.owns_character(character_id));
revoke all on public.table_currencies, public.character_wallets, public.table_experience_types, public.character_experience from anon;
grant select on public.table_currencies, public.character_wallets, public.table_experience_types, public.character_experience to authenticated;

-- DELETE em Realtime precisa da linha inteira para o filtro por mesa funcionar.
alter table public.table_currencies replica identity full;
alter table public.character_wallets replica identity full;
alter table public.table_experience_types replica identity full;
alter table public.character_experience replica identity full;
do $$ declare t text; begin
  foreach t in array array['table_currencies', 'character_wallets', 'table_experience_types', 'character_experience'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- condições dos personagens: gatilho que preserva state.conditions ----------
-- Só gm_set_conditions (que liga a flag de sessão elara.mh) altera a chave. Qualquer outra escrita — do jogador, do PartyPanel,
-- o upsert do PostgREST (INSERT ... ON CONFLICT DO UPDATE passa pelo caminho de UPDATE com OLD) ou as funções da rotina — mantém o que já existe.
create or replace function public.state_keep_conditions() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('elara.mh', true), '') = '1' then return new; end if;
  if jsonb_typeof(new.state) is distinct from 'object' then return new; end if;
  if tg_op = 'INSERT' then
    new.state := new.state - 'conditions';
  elsif jsonb_typeof(old.state) = 'object' and old.state ? 'conditions' then
    new.state := jsonb_set(new.state, '{conditions}', old.state -> 'conditions');
  else
    new.state := new.state - 'conditions';
  end if;
  return new;
end $$;
drop trigger if exists state_keep_conditions on public.table_character_state;
create trigger state_keep_conditions before insert or update on public.table_character_state
  for each row execute function public.state_keep_conditions();

-- ---------- helpers internos (ninguém chama direto) ----------
-- Abre uma operação do mestre: confere login/mestre/alvo, serializa por request_id e devolve o resultado já gravado, se houver.
create or replace function public.mh_begin(p_table uuid, p_character uuid, p_request uuid, p_category text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.master_audit_log;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode fazer isto.'; end if;
  if p_request is null then raise exception 'Operação sem identificador (request_id).'; end if;
  if p_character is not null and not exists (
    select 1 from public.table_members where table_id = p_table and character_id = p_character and status = 'approved'
  ) then raise exception 'Este personagem não está vinculado a um jogador aprovado da mesa.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request::text, 0));
  select * into r from public.master_audit_log where request_id = p_request and character_id is not distinct from p_character;
  if found then
    if r.table_id <> p_table or r.category <> p_category then
      raise exception 'Este identificador de operação já foi usado em outra operação.';
    end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'category', r.category, 'kind', r.kind, 'summary', r.summary, 'before', r.before, 'after', r.after);
  end if;
  return null;
end $$;

create or replace function public.mh_log(p_table uuid, p_character uuid, p_category text, p_kind text, p_summary text,
  p_before jsonb, p_after jsonb, p_note text, p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  insert into public.master_audit_log (table_id, actor_id, character_id, category, kind, summary, before, after, note, request_id)
  values (p_table, auth.uid(), p_character, p_category, p_kind, left(coalesce(p_summary, ''), 300), p_before, p_after, left(coalesce(p_note, ''), 200), p_request);
  return jsonb_build_object('ok', true, 'replayed', false, 'category', p_category, 'kind', p_kind, 'summary', left(coalesce(p_summary, ''), 300), 'before', p_before, 'after', p_after);
end $$;

-- Condições: no máximo 8, rótulo único (sem diferenciar maiúsculas), só as chaves conhecidas.
create or replace function public.mh_clean_conditions(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare out jsonb := '[]'::jsonb; e jsonb; lbl text; seen text[] := '{}'; v_id text; v_note text; v_dur text; o jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'array' then raise exception 'Lista de condições inválida.'; end if;
  for e in select x from jsonb_array_elements(p) x loop
    exit when jsonb_array_length(out) >= 8;
    continue when jsonb_typeof(e) <> 'object';
    lbl := left(btrim(coalesce(e->>'label', '')), 24);
    continue when lbl = '' or lower(lbl) = any(seen);
    seen := seen || lower(lbl);
    v_id := coalesce(e->>'id', '');
    if v_id !~ '^[A-Za-z0-9_-]{1,40}$' then v_id := 'c' || substr(md5(random()::text || clock_timestamp()::text), 1, 8); end if;
    v_note := left(btrim(coalesce(e->>'note', '')), 120);
    v_dur := left(btrim(coalesce(e->>'duration', '')), 40);
    o := jsonb_build_object('id', v_id, 'label', lbl, 'icon', left(coalesce(nullif(e->>'icon', ''), '✦'), 8));
    if v_note <> '' then o := o || jsonb_build_object('note', v_note); end if;
    if v_dur <> '' then o := o || jsonb_build_object('duration', v_dur); end if;
    out := out || jsonb_build_array(o);
  end loop;
  return out;
end $$;

-- ---------- RPCs: dinheiro e XP exatos ----------
-- p_mode 'add' (valor com sinal) ou 'set' (valor final). Grava a ficha e a fila de concessões (money_awards) exatamente como
-- grant_money, com o delta EFETIVO (depois do limite 0..999.999.999), que é o que o app do jogador soma ao reconciliar.
create or replace function public.gm_adjust_money(p_table uuid, p_character uuid, p_mode text, p_amount bigint,
  p_note text default '', p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; d jsonb; cur bigint; nw bigint; eff bigint; v_kind text; v_sum text;
begin
  rep := public.mh_begin(p_table, p_character, p_request_id, 'money');
  if rep is not null then return rep; end if;
  if p_mode not in ('add', 'set') then raise exception 'Modo inválido.'; end if;
  if p_amount is null then raise exception 'Informe um valor.'; end if;
  if p_mode = 'add' and (p_amount = 0 or abs(p_amount) > 1000000) then raise exception 'Informe um valor de 1 a 1.000.000 (negativo remove).'; end if;
  if p_mode = 'set' and (p_amount < 0 or p_amount > 999999999) then raise exception 'O saldo deve ficar entre 0 e 999.999.999.'; end if;
  select data into d from public.characters where id = p_character for update;
  if d is null then raise exception 'Ficha não encontrada.'; end if;
  cur := least(999999999, greatest(0, public.sheet_int(d, 'money', 500)));
  nw := case when p_mode = 'set' then p_amount else least(999999999, greatest(0, cur + p_amount)) end;
  eff := nw - cur;
  if eff <> 0 then
    update public.characters set data = jsonb_set(data, '{money}', to_jsonb(nw)) where id = p_character;
    -- money_awards.amount só aceita ±1.000.000: variações maiores (definir valor) ficam no teto, com a variação real na nota.
    -- A ficha e o histórico administrativo guardam o valor exato; o rebase do jogador usa a ficha, não esta linha.
    insert into public.money_awards (table_id, character_id, amount, note, claimed_at)
    values (p_table, p_character, (sign(eff) * least(abs(eff), 1000000))::int,
      case when abs(eff) > 1000000 then left(left(coalesce(p_note, ''), 150) || format(' [variação real: %s]', eff), 200) else left(coalesce(p_note, ''), 200) end, now());
  end if;
  v_kind := case when p_mode = 'set' then 'set' when p_amount > 0 then 'add' else 'subtract' end;
  v_sum := format('Dinheiro: %s → %s', cur, nw);
  return public.mh_log(p_table, p_character, 'money', v_kind, v_sum, jsonb_build_object('money', cur), jsonb_build_object('money', nw), p_note, p_request_id);
end $$;

create or replace function public.gm_adjust_xp(p_table uuid, p_character uuid, p_mode text, p_amount bigint,
  p_note text default '', p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; d jsonb; cur bigint; nw bigint; eff bigint; v_kind text; v_sum text;
begin
  rep := public.mh_begin(p_table, p_character, p_request_id, 'xp');
  if rep is not null then return rep; end if;
  if p_mode not in ('add', 'set') then raise exception 'Modo inválido.'; end if;
  if p_amount is null then raise exception 'Informe um valor.'; end if;
  if p_mode = 'add' and (p_amount = 0 or abs(p_amount) > 10000) then raise exception 'Informe um valor de XP de 1 a 10000 (negativo remove).'; end if;
  if p_mode = 'set' and (p_amount < 0 or p_amount > 1000000) then raise exception 'O XP deve ficar entre 0 e 1.000.000.'; end if;
  select data into d from public.characters where id = p_character for update;
  if d is null then raise exception 'Ficha não encontrada.'; end if;
  cur := least(1000000, greatest(0, public.sheet_int(d, 'xp', 0)));
  nw := case when p_mode = 'set' then p_amount else least(1000000, greatest(0, cur + p_amount)) end;
  eff := nw - cur;
  if eff <> 0 then
    update public.characters set data = jsonb_set(data, '{xp}', to_jsonb(nw)) where id = p_character;
    -- xp_awards.amount só aceita ±10.000: variações maiores ficam no teto, com a variação real na nota (ver gm_adjust_money).
    insert into public.xp_awards (table_id, character_id, amount, note, claimed_at)
    values (p_table, p_character, (sign(eff) * least(abs(eff), 10000))::int,
      case when abs(eff) > 10000 then left(left(coalesce(p_note, ''), 150) || format(' [variação real: %s]', eff), 200) else left(coalesce(p_note, ''), 200) end, now());
  end if;
  v_kind := case when p_mode = 'set' then 'set' when p_amount > 0 then 'add' else 'subtract' end;
  v_sum := format('XP: %s → %s', cur, nw);
  return public.mh_log(p_table, p_character, 'xp', v_kind, v_sum, jsonb_build_object('xp', cur), jsonb_build_object('xp', nw), p_note, p_request_id);
end $$;

-- ---------- RPC: entrega de itens com histórico (usa gm_give_item, que continua igual) ----------
create or replace function public.gm_give_items(p_table uuid, p_character uuid, p_id text, p_custom jsonb, p_qty int,
  p_note text default '', p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; d jsonb; inv_b jsonb; inv_a jsonb; v_item text; v_name text := ''; q_b int := 0; q_a int; i int;
begin
  rep := public.mh_begin(p_table, p_character, p_request_id, 'item');
  if rep is not null then return rep; end if;
  select data into d from public.characters where id = p_character for update;
  if d is null then raise exception 'Ficha não encontrada.'; end if;
  inv_b := public.inv_get(d);
  perform public.gm_give_item(p_table, p_character, p_id, p_custom, p_qty); -- valida mestre, quantidade, item e mochila cheia
  select data into d from public.characters where id = p_character;
  inv_a := public.inv_get(d);
  if p_custom is not null and jsonb_typeof(p_custom) = 'object' then
    select e->>'id', e->'custom'->>'name' into v_item, v_name
      from jsonb_array_elements(inv_a) e
      where not exists (select 1 from jsonb_array_elements(inv_b) x where x->>'id' = e->>'id') limit 1;
  else
    v_item := p_id;
    i := public.inv_idx(inv_b, p_id);
    if i >= 0 then q_b := public.sheet_int(inv_b -> i, 'qty', 0)::int; end if;
  end if;
  i := public.inv_idx(inv_a, v_item);
  q_a := case when i >= 0 then public.sheet_int(inv_a -> i, 'qty', 0)::int else 0 end;
  return public.mh_log(p_table, p_character, 'item', 'give',
    format('Entregou %sx %s', p_qty, coalesce(nullif(v_name, ''), v_item)),
    jsonb_build_object('item', v_item, 'name', v_name, 'qty', q_b), jsonb_build_object('item', v_item, 'name', v_name, 'qty', q_a, 'given', p_qty), p_note, p_request_id);
end $$;

-- ---------- RPCs: moedas e carteira ----------
create or replace function public.gm_upsert_currency(p_table uuid, p_id uuid, p_name text, p_symbol text, p_description text,
  p_rate numeric, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; v_name text := btrim(coalesce(p_name, '')); v_sym text := btrim(coalesce(p_symbol, '')); before_row jsonb; r public.table_currencies;
begin
  rep := public.mh_begin(p_table, null, p_request_id, 'currency');
  if rep is not null then return rep; end if;
  if char_length(v_name) not between 1 and 40 then raise exception 'Dê um nome à moeda (até 40 caracteres).'; end if;
  if v_sym = '' then v_sym := '¤'; end if;
  if char_length(v_sym) > 8 then raise exception 'O símbolo pode ter até 8 caracteres.'; end if;
  if p_rate is not null and (p_rate <= 0 or p_rate > 1000000000) then raise exception 'A taxa de referência deve ser maior que 0.'; end if;
  begin
    if p_id is null then
      if (select count(*) from public.table_currencies where table_id = p_table) >= 20 then raise exception 'Esta mesa já tem 20 moedas.'; end if;
      insert into public.table_currencies (table_id, name, symbol, description, rate)
      values (p_table, v_name, v_sym, left(coalesce(p_description, ''), 300), round(p_rate, 6)) returning * into r;
      return public.mh_log(p_table, null, 'currency', 'create', 'Criou a moeda ' || r.name, null, to_jsonb(r), '', p_request_id) || jsonb_build_object('id', r.id);
    end if;
    select to_jsonb(c) into before_row from public.table_currencies c where id = p_id and table_id = p_table for update;
    if before_row is null then raise exception 'Moeda não encontrada.'; end if;
    update public.table_currencies set name = v_name, symbol = v_sym, description = left(coalesce(p_description, ''), 300), rate = round(p_rate, 6)
      where id = p_id and table_id = p_table returning * into r;
  exception when unique_violation then raise exception 'Já existe uma moeda com este nome.';
  end;
  return public.mh_log(p_table, null, 'currency', 'update', 'Alterou a moeda ' || r.name, before_row, to_jsonb(r), '', p_request_id) || jsonb_build_object('id', r.id);
end $$;

create or replace function public.gm_delete_currency(p_table uuid, p_id uuid, p_force boolean, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; c public.table_currencies; held jsonb; n int;
begin
  rep := public.mh_begin(p_table, null, p_request_id, 'currency');
  if rep is not null then return rep; end if;
  select * into c from public.table_currencies where id = p_id and table_id = p_table for update;
  if not found then raise exception 'Moeda não encontrada.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('character_id', character_id, 'amount', amount)), '[]'::jsonb), count(*)
    into held, n from public.character_wallets where currency_id = p_id and amount > 0;
  if n > 0 and not coalesce(p_force, false) then
    raise exception 'Esta moeda está na carteira de % personagem(ns). Confirme a exclusão para apagar os saldos.', n;
  end if;
  delete from public.table_currencies where id = p_id and table_id = p_table; -- apaga as carteiras em cascata
  return public.mh_log(p_table, null, 'currency', 'delete', 'Apagou a moeda ' || c.name || case when n > 0 then format(' (%s carteira(s) com saldo)', n) else '' end,
    jsonb_build_object('currency', to_jsonb(c), 'wallets', held), null, '', p_request_id);
end $$;

create or replace function public.gm_wallet_adjust(p_table uuid, p_character uuid, p_currency uuid, p_mode text, p_amount bigint,
  p_note text default '', p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; c public.table_currencies; cur bigint; nw bigint; v_kind text;
begin
  rep := public.mh_begin(p_table, p_character, p_request_id, 'wallet');
  if rep is not null then return rep; end if;
  if p_mode not in ('add', 'set') then raise exception 'Modo inválido.'; end if;
  if p_amount is null then raise exception 'Informe um valor.'; end if;
  if p_mode = 'add' and (p_amount = 0 or abs(p_amount) > 999999999) then raise exception 'Informe um valor de 1 a 999.999.999 (negativo remove).'; end if;
  if p_mode = 'set' and (p_amount < 0 or p_amount > 999999999) then raise exception 'O saldo deve ficar entre 0 e 999.999.999.'; end if;
  select * into c from public.table_currencies where id = p_currency and table_id = p_table for share;
  if not found then raise exception 'Moeda não encontrada nesta mesa.'; end if;
  insert into public.character_wallets (table_id, character_id, currency_id, amount) values (p_table, p_character, p_currency, 0)
    on conflict (character_id, currency_id) do nothing;
  select amount into cur from public.character_wallets where character_id = p_character and currency_id = p_currency for update;
  nw := case when p_mode = 'set' then p_amount else least(999999999, greatest(0, cur + p_amount)) end;
  update public.character_wallets set amount = nw, updated_at = now() where character_id = p_character and currency_id = p_currency;
  v_kind := case when p_mode = 'set' then 'set' when p_amount > 0 then 'add' else 'subtract' end;
  return public.mh_log(p_table, p_character, 'wallet', v_kind, format('%s: %s → %s', c.name, cur, nw),
    jsonb_build_object('currency', c.id, 'name', c.name, 'symbol', c.symbol, 'amount', cur),
    jsonb_build_object('currency', c.id, 'name', c.name, 'symbol', c.symbol, 'amount', nw), p_note, p_request_id);
end $$;

-- ---------- RPCs: tipos de experiência e contadores ----------
create or replace function public.gm_upsert_experience_type(p_table uuid, p_id uuid, p_name text, p_description text,
  p_icon text, p_category text, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; v_name text := btrim(coalesce(p_name, '')); v_icon text := btrim(coalesce(p_icon, '')); before_row jsonb; r public.table_experience_types;
begin
  rep := public.mh_begin(p_table, null, p_request_id, 'experience');
  if rep is not null then return rep; end if;
  if char_length(v_name) not between 1 and 40 then raise exception 'Dê um nome à experiência (até 40 caracteres).'; end if;
  if v_icon = '' then v_icon := '★'; end if;
  if char_length(v_icon) > 8 then raise exception 'O ícone pode ter até 8 caracteres.'; end if;
  begin
    if p_id is null then
      if (select count(*) from public.table_experience_types where table_id = p_table) >= 20 then raise exception 'Esta mesa já tem 20 tipos de experiência.'; end if;
      insert into public.table_experience_types (table_id, name, description, icon, category)
      values (p_table, v_name, left(coalesce(p_description, ''), 300), v_icon, left(btrim(coalesce(p_category, '')), 30)) returning * into r;
      return public.mh_log(p_table, null, 'experience', 'type_create', 'Criou a experiência ' || r.name, null, to_jsonb(r), '', p_request_id) || jsonb_build_object('id', r.id);
    end if;
    select to_jsonb(t) into before_row from public.table_experience_types t where id = p_id and table_id = p_table for update;
    if before_row is null then raise exception 'Tipo de experiência não encontrado.'; end if;
    update public.table_experience_types set name = v_name, description = left(coalesce(p_description, ''), 300), icon = v_icon, category = left(btrim(coalesce(p_category, '')), 30)
      where id = p_id and table_id = p_table returning * into r;
  exception when unique_violation then raise exception 'Já existe uma experiência com este nome.';
  end;
  return public.mh_log(p_table, null, 'experience', 'type_update', 'Alterou a experiência ' || r.name, before_row, to_jsonb(r), '', p_request_id) || jsonb_build_object('id', r.id);
end $$;

create or replace function public.gm_delete_experience_type(p_table uuid, p_id uuid, p_force boolean, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; t public.table_experience_types; held jsonb; n int;
begin
  rep := public.mh_begin(p_table, null, p_request_id, 'experience');
  if rep is not null then return rep; end if;
  select * into t from public.table_experience_types where id = p_id and table_id = p_table for update;
  if not found then raise exception 'Tipo de experiência não encontrado.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('character_id', character_id, 'amount', amount)), '[]'::jsonb), count(*)
    into held, n from public.character_experience where type_id = p_id and amount > 0;
  if n > 0 and not coalesce(p_force, false) then
    raise exception 'Esta experiência está com % personagem(ns). Confirme a exclusão para apagar os valores.', n;
  end if;
  delete from public.table_experience_types where id = p_id and table_id = p_table; -- apaga os contadores em cascata
  return public.mh_log(p_table, null, 'experience', 'type_delete', 'Apagou a experiência ' || t.name || case when n > 0 then format(' (%s personagem(ns) com valor)', n) else '' end,
    jsonb_build_object('type', to_jsonb(t), 'counters', held), null, '', p_request_id);
end $$;

create or replace function public.gm_experience_adjust(p_table uuid, p_character uuid, p_type uuid, p_mode text, p_amount bigint,
  p_note text default '', p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; t public.table_experience_types; cur bigint; nw bigint; v_kind text;
begin
  rep := public.mh_begin(p_table, p_character, p_request_id, 'experience');
  if rep is not null then return rep; end if;
  if p_mode not in ('add', 'set') then raise exception 'Modo inválido.'; end if;
  if p_amount is null then raise exception 'Informe um valor.'; end if;
  if p_mode = 'add' and (p_amount = 0 or abs(p_amount) > 1000000) then raise exception 'Informe um valor de 1 a 1.000.000 (negativo remove).'; end if;
  if p_mode = 'set' and (p_amount < 0 or p_amount > 1000000) then raise exception 'O valor deve ficar entre 0 e 1.000.000.'; end if;
  select * into t from public.table_experience_types where id = p_type and table_id = p_table for share;
  if not found then raise exception 'Tipo de experiência não encontrado nesta mesa.'; end if;
  insert into public.character_experience (table_id, character_id, type_id, amount) values (p_table, p_character, p_type, 0)
    on conflict (character_id, type_id) do nothing;
  select amount into cur from public.character_experience where character_id = p_character and type_id = p_type for update;
  nw := case when p_mode = 'set' then p_amount else least(1000000, greatest(0, cur + p_amount)) end;
  update public.character_experience set amount = nw, updated_at = now() where character_id = p_character and type_id = p_type;
  v_kind := case when p_mode = 'set' then 'set' when p_amount > 0 then 'add' else 'subtract' end;
  return public.mh_log(p_table, p_character, 'experience', v_kind, format('%s: %s → %s', t.name, cur, nw),
    jsonb_build_object('type', t.id, 'name', t.name, 'icon', t.icon, 'amount', cur),
    jsonb_build_object('type', t.id, 'name', t.name, 'icon', t.icon, 'amount', nw), p_note, p_request_id);
end $$;

-- ---------- RPC: condições do personagem ----------
-- Troca a lista inteira de condições (a interface calcula a nova lista a partir do que o servidor devolveu).
create or replace function public.gm_set_conditions(p_table uuid, p_character uuid, p_conditions jsonb,
  p_note text default '', p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; st jsonb; old_c jsonb; new_c jsonb; added text; removed text; v_kind text; v_sum text;
begin
  rep := public.mh_begin(p_table, p_character, p_request_id, 'condition');
  if rep is not null then return rep; end if;
  new_c := public.mh_clean_conditions(p_conditions);
  insert into public.table_character_state (table_id, character_id, state) values (p_table, p_character, '{}'::jsonb)
    on conflict (table_id, character_id) do nothing;
  select state into st from public.table_character_state where table_id = p_table and character_id = p_character for update;
  old_c := coalesce(st -> 'conditions', '[]'::jsonb);
  perform set_config('elara.mh', '1', true);
  update public.table_character_state set state = jsonb_set(state, '{conditions}', new_c) where table_id = p_table and character_id = p_character;
  perform set_config('elara.mh', '', true);
  select string_agg(n->>'label', ', ') into added from jsonb_array_elements(new_c) n
    where not exists (select 1 from jsonb_array_elements(old_c) o where lower(o->>'label') = lower(n->>'label'));
  select string_agg(o->>'label', ', ') into removed from jsonb_array_elements(old_c) o
    where not exists (select 1 from jsonb_array_elements(new_c) n where lower(n->>'label') = lower(o->>'label'));
  v_kind := case when added is not null and removed is null then 'add' when removed is not null and added is null then 'remove' else 'update' end;
  v_sum := concat_ws(' · ', case when added is not null then 'Aplicou: ' || added end, case when removed is not null then 'Removeu: ' || removed end);
  if v_sum = '' then v_sum := 'Atualizou as condições'; end if;
  return public.mh_log(p_table, p_character, 'condition', v_kind, v_sum, jsonb_build_object('conditions', old_c), jsonb_build_object('conditions', new_c), p_note, p_request_id);
end $$;

-- Sonda de capacidade: a interface só liga a Central se esta função existir.
create or replace function public.master_hub_version() returns int
language sql immutable as $$ select 1; $$;

-- ---------- permissões ----------
revoke all on function public.mh_begin(uuid, uuid, uuid, text), public.mh_log(uuid, uuid, text, text, text, jsonb, jsonb, text, uuid),
  public.mh_clean_conditions(jsonb), public.state_keep_conditions() from public, anon, authenticated;
revoke all on function public.gm_adjust_money(uuid, uuid, text, bigint, text, uuid), public.gm_adjust_xp(uuid, uuid, text, bigint, text, uuid),
  public.gm_give_items(uuid, uuid, text, jsonb, int, text, uuid), public.gm_upsert_currency(uuid, uuid, text, text, text, numeric, uuid),
  public.gm_delete_currency(uuid, uuid, boolean, uuid), public.gm_wallet_adjust(uuid, uuid, uuid, text, bigint, text, uuid),
  public.gm_upsert_experience_type(uuid, uuid, text, text, text, text, uuid), public.gm_delete_experience_type(uuid, uuid, boolean, uuid),
  public.gm_experience_adjust(uuid, uuid, uuid, text, bigint, text, uuid), public.gm_set_conditions(uuid, uuid, jsonb, text, uuid) from public, anon;
grant execute on function public.gm_adjust_money(uuid, uuid, text, bigint, text, uuid), public.gm_adjust_xp(uuid, uuid, text, bigint, text, uuid),
  public.gm_give_items(uuid, uuid, text, jsonb, int, text, uuid), public.gm_upsert_currency(uuid, uuid, text, text, text, numeric, uuid),
  public.gm_delete_currency(uuid, uuid, boolean, uuid), public.gm_wallet_adjust(uuid, uuid, uuid, text, bigint, text, uuid),
  public.gm_upsert_experience_type(uuid, uuid, text, text, text, text, uuid), public.gm_delete_experience_type(uuid, uuid, boolean, uuid),
  public.gm_experience_adjust(uuid, uuid, uuid, text, bigint, text, uuid), public.gm_set_conditions(uuid, uuid, jsonb, text, uuid) to authenticated;
revoke all on function public.master_hub_version() from public, anon;
grant execute on function public.master_hub_version() to authenticated;
