-- 0044: Loja aprovada — todo item customizado aprovado pelo mestre entra à venda para a mesa toda (aba "Loja aprovada" do Mercado).
--
-- Documentação: src/features/room/masterHub/README.md (seção "Loja aprovada").
--
-- Em vez de criar outra tabela e outra compra, a Loja aprovada REAPROVEITA a Loja do Mestre (0041/0043): cada item aprovado vira um anúncio
-- em table_shop_items, pago em $, e a compra é a mesma shop_buy (transação única, idempotente, com histórico). O que muda:
--  * table_shop_items.source_id: o pedido (table_custom_items) de onde o anúncio veio; NULL = item criado pelo mestre na Loja do Mestre.
--    O anúncio usa o MESMO id do pedido, então a mochila guarda "custom-<id>" igual ao item que o autor recebeu e as compras empilham.
--  * Gatilho em table_custom_items: aprovado → cria o anúncio (preço = o preço da aprovação); deixou de ser aprovado (revogado) → remove o
--    anúncio. Quem já comprou continua com o item. approve_custom_item/revoke_custom_item não mudam.
--  * Preço 0 vale só para anúncios vindos de aprovação ("Grátis"); os itens criados pelo mestre continuam de 1 para cima.
--  * gm_shop_upsert: aceita o preço 0 nos anúncios aprovados e o limite de 100 itens conta só os criados pelo mestre.
--  * shop_buy: compra de preço 0 em $ não grava money_awards (a coluna não aceita valor 0). O resto é igual.
--  * Os itens já aprovados hoje entram na loja (preenchimento no fim).
--
-- Reescreve gm_shop_upsert e shop_buy (create or replace, mesma assinatura, comportamento antigo preservado) e troca a regra de preço da tabela.
-- Pode ser repetida. ORDEM: aplique e valide (scripts/masterHubDbTest.mjs) antes de publicar o app.

alter table public.table_shop_items
  add column if not exists source_id uuid references public.table_custom_items (id) on delete cascade;
create unique index if not exists table_shop_items_source_uidx on public.table_shop_items (source_id) where source_id is not null;

alter table public.table_shop_items drop constraint if exists table_shop_items_price_check;
alter table public.table_shop_items add constraint table_shop_items_price_check
  check (price between 0 and 999999999 and (price >= 1 or source_id is not null));

-- ---------- gatilho: aprovado entra na loja, revogado sai ----------
create or replace function public.custom_item_to_shop() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
    insert into public.table_shop_items (id, table_id, currency_id, price, name, weight, effects, description, active, source_id)
    values (new.id, new.table_id, null, greatest(0, least(coalesce(new.price, 0), 999999999)), left(new.name, 80), greatest(0, least(coalesce(new.weight, 0), 500)),
      case when jsonb_typeof(new.effects) = 'array' then new.effects else '[]'::jsonb end, left(coalesce(new.description, ''), 1000), true, new.id)
    on conflict (id) do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'approved' and new.status <> 'approved' then
    delete from public.table_shop_items where source_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.custom_item_to_shop() from public, anon, authenticated;

drop trigger if exists custom_item_to_shop on public.table_custom_items;
create trigger custom_item_to_shop after insert or update of status on public.table_custom_items
  for each row execute function public.custom_item_to_shop();

-- ---------- mestre: preço 0 nos anúncios aprovados; limite de 100 só para os do mestre ----------
create or replace function public.gm_shop_upsert(p_table uuid, p_id uuid, p_custom jsonb, p_currency uuid, p_price bigint,
  p_active boolean, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; cur public.table_currencies; v_symbol text := '$'; c jsonb; r public.table_shop_items; before_json jsonb;
begin
  rep := public.mh_begin(p_table, null, p_request_id, 'item');
  if rep is not null then return rep; end if;
  if p_price is null or p_price < 0 or p_price > 999999999 then raise exception 'Informe um preço de 1 a 999.999.999.'; end if;
  if p_currency is not null then
    select * into cur from public.table_currencies where id = p_currency and table_id = p_table for share;
    if not found then raise exception 'Escolha uma moeda desta mesa.'; end if;
    v_symbol := cur.symbol;
  end if;
  if p_id is null then
    if p_price < 1 then raise exception 'Informe um preço de 1 a 999.999.999.'; end if;
    if (select count(*) from public.table_shop_items where table_id = p_table and source_id is null) >= 100 then raise exception 'A loja já tem 100 itens.'; end if;
    c := public.mh_clean_custom(p_custom);
    insert into public.table_shop_items (table_id, currency_id, price, name, weight, effects, description, active)
    values (p_table, p_currency, p_price, c->>'name', (c->>'weight')::numeric, c->'effects', c->>'description', coalesce(p_active, true))
    returning * into r;
    return public.mh_log(p_table, null, 'item', 'shop_create', format('Colocou à venda: %s (%s %s)', r.name, r.price, v_symbol), null, public.mh_shop_json(r), '', p_request_id)
      || jsonb_build_object('id', r.id);
  end if;
  select * into r from public.table_shop_items where id = p_id and table_id = p_table for update;
  if not found then raise exception 'Item da loja não encontrado.'; end if;
  if p_price < 1 and r.source_id is null then raise exception 'Informe um preço de 1 a 999.999.999.'; end if;
  before_json := public.mh_shop_json(r);
  if p_custom is not null then c := public.mh_clean_custom(p_custom); end if;
  update public.table_shop_items set currency_id = p_currency, price = p_price, active = coalesce(p_active, active),
    name = coalesce(c->>'name', name), weight = coalesce((c->>'weight')::numeric, weight),
    effects = coalesce(c->'effects', effects), description = coalesce(c->>'description', description)
    where id = p_id returning * into r;
  return public.mh_log(p_table, null, 'item', 'shop_update', format('Alterou na loja: %s (%s %s)%s', r.name, r.price, v_symbol, case when r.active then '' else ' · pausado' end),
    before_json, public.mh_shop_json(r), '', p_request_id) || jsonb_build_object('id', r.id);
end $$;

-- ---------- jogador: comprar (igual à 0043; preço 0 em $ não grava money_awards) ----------
create or replace function public.shop_buy(p_table uuid, p_character uuid, p_listing uuid, p_qty int, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare lg public.master_audit_log; r public.table_shop_items; cur public.table_currencies; d jsonb; inv_b jsonb; inv_a jsonb;
  w bigint; total bigint; i int; q_b int := 0; q_a int; item_id text; taken jsonb; v_symbol text; v_cname text; new_inv jsonb;
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
  total := r.price * p_qty;
  select data into d from public.characters where id = p_character for update; -- ordem de trava: ficha, depois carteira
  if d is null then raise exception 'Ficha não encontrada.'; end if;
  if r.currency_id is null then
    -- Pago em $: o saldo é o dinheiro da ficha (mesma leitura de gm_adjust_money).
    v_symbol := '$'; v_cname := 'Dinheiro';
    w := least(999999999, greatest(0, public.sheet_int(d, 'money', 500)));
  else
    select * into cur from public.table_currencies where id = r.currency_id and table_id = p_table;
    v_symbol := cur.symbol; v_cname := cur.name;
    insert into public.character_wallets (table_id, character_id, currency_id, amount) values (p_table, p_character, cur.id, 0)
      on conflict (character_id, currency_id) do nothing;
    select amount into w from public.character_wallets where character_id = p_character and currency_id = cur.id for update;
  end if;
  if w < total then
    raise exception 'Saldo insuficiente: você tem % % e o total é % %.', w, v_symbol, total, v_symbol;
  end if;
  item_id := 'custom-' || r.id::text;
  inv_b := public.inv_get(d);
  i := public.inv_idx(inv_b, item_id);
  if i >= 0 then q_b := public.sheet_int(inv_b -> i, 'qty', 0)::int; end if;
  taken := jsonb_build_object('id', item_id, 'qty', p_qty,
    'custom', jsonb_build_object('name', r.name, 'weight', r.weight, 'effects', r.effects, 'description', r.description));
  new_inv := public.inv_put(inv_b, taken); -- recusa acima de 99 por item ou mochila cheia
  if r.currency_id is null then
    update public.characters set data = jsonb_set(jsonb_set(d, '{inventory}', new_inv), '{money}', to_jsonb(w - total)) where id = p_character;
    if total > 0 then
      -- money_awards.amount só aceita ±1.000.000 (e nunca 0): compras maiores ficam no teto, com o valor real na nota.
      -- A ficha e o histórico guardam o valor exato; o rebase do jogador usa a ficha, não esta linha.
      insert into public.money_awards (table_id, character_id, amount, note, claimed_at)
      values (p_table, p_character, (-1 * least(total, 1000000))::int,
        left(format('Loja do Mestre: %sx %s', p_qty, r.name), 150) || case when total > 1000000 then format(' [valor real: -%s]', total) else '' end, now());
    end if;
  else
    update public.characters set data = jsonb_set(d, '{inventory}', new_inv) where id = p_character;
    update public.character_wallets set amount = w - total, updated_at = now() where character_id = p_character and currency_id = cur.id;
  end if;
  select data into d from public.characters where id = p_character;
  inv_a := public.inv_get(d);
  q_a := public.sheet_int(inv_a -> public.inv_idx(inv_a, item_id), 'qty', 0)::int;
  return public.mh_log(p_table, p_character, 'item', 'shop_buy', format('Comprou %sx %s por %s %s', p_qty, r.name, total, v_symbol),
    jsonb_build_object('item', item_id, 'name', r.name, 'qty', q_b, 'symbol', v_symbol, 'currency_name', v_cname, 'wallet', w),
    jsonb_build_object('item', item_id, 'name', r.name, 'qty', q_a, 'bought', p_qty, 'price', r.price, 'total', total, 'symbol', v_symbol, 'currency_name', v_cname, 'wallet', w - total),
    '', p_request_id);
end $$;

-- Sonda de capacidade: 4 = Central + Loja do Mestre + preço em $ + Loja aprovada.
create or replace function public.master_hub_version() returns int
language sql immutable as $$ select 4; $$;

-- ---------- permissões (create or replace mantém os grants; repetido por segurança) ----------
revoke all on function public.gm_shop_upsert(uuid, uuid, jsonb, uuid, bigint, boolean, uuid), public.shop_buy(uuid, uuid, uuid, int, uuid) from public, anon;
grant execute on function public.gm_shop_upsert(uuid, uuid, jsonb, uuid, bigint, boolean, uuid), public.shop_buy(uuid, uuid, uuid, int, uuid) to authenticated;

-- ---------- itens já aprovados entram na loja ----------
insert into public.table_shop_items (id, table_id, currency_id, price, name, weight, effects, description, active, source_id)
select t.id, t.table_id, null, greatest(0, least(coalesce(t.price, 0), 999999999)), left(t.name, 80), greatest(0, least(coalesce(t.weight, 0), 500)),
  case when jsonb_typeof(t.effects) = 'array' then t.effects else '[]'::jsonb end, left(coalesce(t.description, ''), 1000), true, t.id
from public.table_custom_items t
where t.status = 'approved'
on conflict (id) do nothing;
