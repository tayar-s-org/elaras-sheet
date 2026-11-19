-- 0041: Loja do Mestre — itens criados pelo mestre à venda por uma moeda da mesa (as da migração 0040), comprados pelos jogadores no Mercado.
--
-- Documentação: src/features/room/masterHub/README.md (seção "Loja do Mestre").
--
--  * table_shop_items: o que está à venda (nome, peso, efeitos e descrição no MESMO modelo dos itens customizados da ficha, mais
--    moeda e preço). A moeda é amarrada à mesma mesa por FK composta (table_id, currency_id) → table_currencies e NÃO pode ser apagada
--    enquanto houver item à venda nela (on delete restrict). Leitura: membros da mesa veem os itens ATIVOS; o mestre vê todos. Sem política de escrita.
--  * gm_shop_upsert / gm_shop_delete: só o mestre; idempotentes por request_id e registrados no histórico administrativo
--    (categoria 'item', kinds shop_create / shop_update / shop_delete).
--  * shop_buy: o JOGADOR compra para o PRÓPRIO personagem. Numa só transação: trava a ficha e a carteira, confere o saldo, debita a moeda e
--    põe o item na mochila (entrada custom-<id do anúncio>, então compras repetidas empilham). Idempotente por request_id (mesmo id = mesmo
--    resultado, sem cobrar duas vezes). Registra no histórico (kind shop_buy; o mestre vê quem comprou). Vários cliques simultâneos nunca gastam
--    mais do que o saldo.
--  * master_hub_version() passa a devolver 2 (a interface só liga a loja com a versão 2).
--
-- Só cria coisas novas (e troca a sonda de versão); pode ser repetida. ORDEM: aplique e valide (scripts/masterHubDbTest.mjs) antes de publicar o app.

create table if not exists public.table_shop_items (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  currency_id uuid not null,
  price bigint not null check (price between 1 and 999999999),
  name text not null check (char_length(name) between 1 and 80),
  weight numeric not null default 0 check (weight between 0 and 500),
  effects jsonb not null default '[]'::jsonb check (jsonb_typeof(effects) = 'array' and pg_column_size(effects) < 4096),
  description text not null default '' check (char_length(description) <= 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (table_id, id),
  foreign key (table_id, currency_id) references public.table_currencies (table_id, id) on delete restrict
);
create index if not exists table_shop_items_table_idx on public.table_shop_items (table_id, created_at);
alter table public.table_shop_items enable row level security;
drop policy if exists shop_items_select on public.table_shop_items;
create policy shop_items_select on public.table_shop_items for select to authenticated
  using (public.is_gm(table_id) or (active and public.is_member(table_id)));
revoke all on public.table_shop_items from anon;
grant select on public.table_shop_items to authenticated;
alter table public.table_shop_items replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'table_shop_items') then
    alter publication supabase_realtime add table public.table_shop_items;
  end if;
end $$;

-- ---------- ajudantes internos ----------
-- Item customizado limpo (mesmas regras de gm_give_item): nome obrigatório, peso 0..500, até 8 efeitos conhecidos, descrição até 1000.
create or replace function public.mh_clean_custom(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare v_name text; w numeric; v_effects jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then raise exception 'Item inválido.'; end if;
  v_name := left(btrim(coalesce(p->>'name', '')), 80);
  if v_name = '' then raise exception 'Dê um nome ao item.'; end if;
  w := case when p->>'weight' ~ '^[0-9]+(\.[0-9]+)?$' then least(500, round((p->>'weight')::numeric, 2)) else 0 end;
  select coalesce(jsonb_agg(jsonb_build_object('kind', e->>'kind', 'target', left(coalesce(e->>'target', ''), 60), 'bonus', public.sheet_int(e, 'bonus', 0)) order by o), '[]'::jsonb)
    into v_effects
    from (select e, o from jsonb_array_elements(case when jsonb_typeof(p->'effects') = 'array' then p->'effects' else '[]'::jsonb end) with ordinality t(e, o)
          where jsonb_typeof(e) = 'object' and e->>'kind' in ('attribute', 'skill', 'derived', 'damage') order by o limit 8) s;
  return jsonb_build_object('name', v_name, 'weight', w, 'effects', v_effects, 'description', left(coalesce(p->>'description', ''), 1000));
end $$;

-- Retrato do anúncio para o histórico (com o nome e o símbolo da moeda).
create or replace function public.mh_shop_json(r public.table_shop_items) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('item', 'custom-' || r.id::text, 'name', r.name, 'price', r.price, 'active', r.active, 'currency', r.currency_id,
    'currency_name', c.name, 'symbol', c.symbol)
  from public.table_currencies c where c.id = r.currency_id and c.table_id = r.table_id;
$$;

-- ---------- mestre: criar/editar e remover anúncio ----------
-- p_custom nulo na edição mantém nome, peso, efeitos e descrição; p_active liga/desliga a venda sem apagar.
create or replace function public.gm_shop_upsert(p_table uuid, p_id uuid, p_custom jsonb, p_currency uuid, p_price bigint,
  p_active boolean, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; cur public.table_currencies; c jsonb; r public.table_shop_items; before_json jsonb;
begin
  rep := public.mh_begin(p_table, null, p_request_id, 'item');
  if rep is not null then return rep; end if;
  if p_price is null or p_price < 1 or p_price > 999999999 then raise exception 'Informe um preço de 1 a 999.999.999.'; end if;
  select * into cur from public.table_currencies where id = p_currency and table_id = p_table for share;
  if not found then raise exception 'Escolha uma moeda desta mesa.'; end if;
  if p_id is null then
    if (select count(*) from public.table_shop_items where table_id = p_table) >= 100 then raise exception 'A loja já tem 100 itens.'; end if;
    c := public.mh_clean_custom(p_custom);
    insert into public.table_shop_items (table_id, currency_id, price, name, weight, effects, description, active)
    values (p_table, p_currency, p_price, c->>'name', (c->>'weight')::numeric, c->'effects', c->>'description', coalesce(p_active, true))
    returning * into r;
    return public.mh_log(p_table, null, 'item', 'shop_create', format('Colocou à venda: %s (%s %s)', r.name, r.price, cur.symbol), null, public.mh_shop_json(r), '', p_request_id)
      || jsonb_build_object('id', r.id);
  end if;
  select * into r from public.table_shop_items where id = p_id and table_id = p_table for update;
  if not found then raise exception 'Item da loja não encontrado.'; end if;
  before_json := public.mh_shop_json(r);
  if p_custom is not null then c := public.mh_clean_custom(p_custom); end if;
  update public.table_shop_items set currency_id = p_currency, price = p_price, active = coalesce(p_active, active),
    name = coalesce(c->>'name', name), weight = coalesce((c->>'weight')::numeric, weight),
    effects = coalesce(c->'effects', effects), description = coalesce(c->>'description', description)
    where id = p_id returning * into r;
  return public.mh_log(p_table, null, 'item', 'shop_update', format('Alterou na loja: %s (%s %s)%s', r.name, r.price, cur.symbol, case when r.active then '' else ' · pausado' end),
    before_json, public.mh_shop_json(r), '', p_request_id) || jsonb_build_object('id', r.id);
end $$;

create or replace function public.gm_shop_delete(p_table uuid, p_id uuid, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; r public.table_shop_items; before_json jsonb;
begin
  rep := public.mh_begin(p_table, null, p_request_id, 'item');
  if rep is not null then return rep; end if;
  select * into r from public.table_shop_items where id = p_id and table_id = p_table for update;
  if not found then raise exception 'Item da loja não encontrado.'; end if;
  before_json := public.mh_shop_json(r);
  delete from public.table_shop_items where id = p_id;
  return public.mh_log(p_table, null, 'item', 'shop_delete', 'Tirou da loja: ' || r.name, before_json, null, '', p_request_id);
end $$;

-- ---------- jogador: comprar ----------
create or replace function public.shop_buy(p_table uuid, p_character uuid, p_listing uuid, p_qty int, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lg public.master_audit_log; r public.table_shop_items; cur public.table_currencies; d jsonb; inv_b jsonb; inv_a jsonb;
  w bigint; total bigint; i int; q_b int := 0; q_a int; item_id text; taken jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_request_id is null then raise exception 'Operação sem identificador (request_id).'; end if;
  if not public.owns_character(p_character) then raise exception 'Você só pode comprar para o seu próprio personagem.'; end if;
  if not exists (select 1 from public.table_members where table_id = p_table and character_id = p_character and status = 'approved') then
    raise exception 'Seu personagem não está aprovado nesta mesa.';
  end if;
  if exists (select 1 from public.tables where id = p_table and status::text = 'closed') then raise exception 'Esta mesa foi encerrada.'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then raise exception 'Informe uma quantidade de 1 a 99.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into lg from public.master_audit_log where request_id = p_request_id and character_id is not distinct from p_character;
  if found then
    if lg.table_id <> p_table or lg.kind <> 'shop_buy' then raise exception 'Este identificador de operação já foi usado em outra operação.'; end if;
    return jsonb_build_object('ok', true, 'replayed', true, 'category', lg.category, 'kind', lg.kind, 'summary', lg.summary, 'before', lg.before, 'after', lg.after);
  end if;
  select * into r from public.table_shop_items where id = p_listing and table_id = p_table and active;
  if not found then raise exception 'Este item não está mais à venda.'; end if;
  select * into cur from public.table_currencies where id = r.currency_id and table_id = p_table;
  total := r.price * p_qty;
  select data into d from public.characters where id = p_character for update; -- ordem de trava: ficha, depois carteira
  if d is null then raise exception 'Ficha não encontrada.'; end if;
  insert into public.character_wallets (table_id, character_id, currency_id, amount) values (p_table, p_character, cur.id, 0)
    on conflict (character_id, currency_id) do nothing;
  select amount into w from public.character_wallets where character_id = p_character and currency_id = cur.id for update;
  if w < total then
    raise exception 'Saldo insuficiente: você tem % % e o total é % %.', w, cur.symbol, total, cur.symbol;
  end if;
  item_id := 'custom-' || r.id::text;
  inv_b := public.inv_get(d);
  i := public.inv_idx(inv_b, item_id);
  if i >= 0 then q_b := public.sheet_int(inv_b -> i, 'qty', 0)::int; end if;
  taken := jsonb_build_object('id', item_id, 'qty', p_qty,
    'custom', jsonb_build_object('name', r.name, 'weight', r.weight, 'effects', r.effects, 'description', r.description));
  update public.characters set data = jsonb_set(d, '{inventory}', public.inv_put(inv_b, taken)) where id = p_character; -- recusa acima de 99 por item ou mochila cheia
  update public.character_wallets set amount = w - total, updated_at = now() where character_id = p_character and currency_id = cur.id;
  select data into d from public.characters where id = p_character;
  inv_a := public.inv_get(d);
  q_a := public.sheet_int(inv_a -> public.inv_idx(inv_a, item_id), 'qty', 0)::int;
  return public.mh_log(p_table, p_character, 'item', 'shop_buy', format('Comprou %sx %s por %s %s', p_qty, r.name, total, cur.symbol),
    jsonb_build_object('item', item_id, 'name', r.name, 'qty', q_b, 'symbol', cur.symbol, 'currency_name', cur.name, 'wallet', w),
    jsonb_build_object('item', item_id, 'name', r.name, 'qty', q_a, 'bought', p_qty, 'price', r.price, 'total', total, 'symbol', cur.symbol, 'currency_name', cur.name, 'wallet', w - total),
    '', p_request_id);
end $$;

-- Sonda de capacidade: 2 = Central + Loja do Mestre.
create or replace function public.master_hub_version() returns int
language sql immutable as $$ select 2; $$;

-- ---------- permissões ----------
revoke all on function public.mh_clean_custom(jsonb), public.mh_shop_json(public.table_shop_items) from public, anon, authenticated;
revoke all on function public.gm_shop_upsert(uuid, uuid, jsonb, uuid, bigint, boolean, uuid), public.gm_shop_delete(uuid, uuid, uuid),
  public.shop_buy(uuid, uuid, uuid, int, uuid) from public, anon;
grant execute on function public.gm_shop_upsert(uuid, uuid, jsonb, uuid, bigint, boolean, uuid), public.gm_shop_delete(uuid, uuid, uuid),
  public.shop_buy(uuid, uuid, uuid, int, uuid) to authenticated;
