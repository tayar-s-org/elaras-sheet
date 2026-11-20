-- 0039: inventário — gastar unidades e ajustar cantil pelo token, transferir item entre personagens da mesa e o mestre
-- entregar itens (do catálogo ou criados por ele).
--
-- Fonte oficial dos dados: characters.data.inventory (a mesma que a ficha usa). As funções abaixo escrevem direto nela, como
-- grant_money (0035): tomam o lock da linha (for update), mudam o jsonb e o gatilho characters_before_update sobe a revisão.
-- A ficha aberta reconcilia a diferença com um merge de 3 vias (src/sheetRebase.js, mergeInventory).
--
-- Regras de segurança (todas checadas aqui, no servidor, não só na interface):
--  * o jogador só mexe na própria mochila (owns_character); o mestre da mesa da ficha também (is_gm);
--  * estas funções nunca aumentam quantidade por conta própria: inventory_consume só diminui; itens novos entram só por
--    gm_give_item (mestre) ou inventory_transfer (sai de um e entra no outro, na mesma transação).
--    Isto vale só para elas: a ficha é livre (o dono edita characters.data direto, inclusive inventário, dinheiro e XP;
--    ver "Modelo de confiança" em supabase/migrations/README.md), então não é uma garantia contra o próprio dono;
--  * transferência: remetente e destinatário aprovados NA MESMA mesa, quantidade <= saldo salvo, teto de 99 no destino.
--    Se algo falha (ex.: estouro do teto), a transação inteira volta: nada some e nada se duplica;
--  * item customizado transferido: o payload (name/weight/effects/description) vai junto, então o destinatário não depende de
--    table_custom_items. Se o último exemplar sai do solicitante original, o registro dele é marcado discarded_at só para a
--    reposição automática dele não devolver o item (isso NÃO mexe no item do destinatário). Se o item voltar ao solicitante,
--    discarded_at é limpo.
--  * cantil: capacidade 1 L por unidade (inv_capacity); níveis em passos de 0,05; um nível por unidade em "fills".
--
-- Só cria coisas novas (tabela, funções, política); pode ser repetida.
-- ORDEM: publique o app novo antes (ele entende "mochila mudou na nuvem" sem acusar conflito) e só então rode esta migração.

create table if not exists public.inventory_log (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  actor_id uuid,
  from_character uuid,
  to_character uuid,
  item_id text not null,
  item_name text not null default '',
  qty int not null check (qty > 0),
  kind text not null check (kind in ('transfer', 'gm_give')),
  created_at timestamptz not null default now()
);
create index if not exists inventory_log_table_idx on public.inventory_log (table_id, created_at desc);
alter table public.inventory_log enable row level security;
drop policy if exists inventory_log_select on public.inventory_log;
create policy inventory_log_select on public.inventory_log for select using (public.is_member(table_id));

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inventory_log') then
    alter publication supabase_realtime add table public.inventory_log;
  end if;
end $$;

-- ---------- ajudantes internos (não são chamados pelo app) ----------

-- Capacidade em litros por unidade (só o cantil). Deve bater com LIQUID_CONTAINERS em src/market/items.js (há teste).
create or replace function public.inv_capacity(p_id text) returns numeric
language sql immutable set search_path = public as $$
  select case p_id when 'aventura-equipamento-de-aventura-cantil-odre' then 1.0::numeric else null end;
$$;

create or replace function public.inv_get(p_data jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case when jsonb_typeof(p_data->'inventory') = 'array' then p_data->'inventory' else '[]'::jsonb end;
$$;

-- Posição (a partir de 0) da entrada na mochila, ou -1.
create or replace function public.inv_idx(p_inv jsonb, p_id text) returns int
language sql immutable set search_path = public as $$
  select coalesce((select (o - 1)::int from jsonb_array_elements(p_inv) with ordinality t(v, o) where v->>'id' = p_id limit 1), -1);
$$;

-- Níveis de líquido: exatamente um por unidade, entre 0 e a capacidade, em passos de 0,05.
create or replace function public.inv_norm_fills(p_fills jsonb, p_qty int, p_cap numeric) returns jsonb
language sql immutable set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(trim_scale(round(least(p_cap, greatest(0, coalesce(v, 0))) * 20) / 20)) order by i), '[]'::jsonb)
  from (
    select i, case when jsonb_typeof(p_fills) = 'array' and jsonb_typeof(p_fills -> (i - 1)) = 'number' then (p_fills ->> (i - 1))::numeric end as v
    from generate_series(1, greatest(0, p_qty)) i
  ) s;
$$;

-- Tira unidades de uma entrada. Devolve { inv: nova mochila, taken: o que saiu (com payload custom e níveis das unidades) }.
create or replace function public.inv_take(p_inv jsonb, p_id text, p_qty int, p_index int, p_custom_last_ok boolean) returns jsonb
language plpgsql set search_path = public as $$
declare i int; e jsonb; q int; cap numeric; fills jsonb; kept jsonb; taken jsonb;
begin
  if p_qty is null or p_qty < 1 then raise exception 'Informe uma quantidade de 1 ou mais.'; end if;
  i := public.inv_idx(p_inv, p_id);
  if i < 0 then raise exception 'Este item não está na mochila (ou a ficha ainda não foi salva).'; end if;
  e := p_inv -> i;
  q := public.sheet_int(e, 'qty', 0)::int;
  if p_qty > q then raise exception 'Você só tem % unidade(s) deste item.', q; end if;
  if p_index is not null and (p_qty <> 1 or p_index < 0 or p_index >= q) then raise exception 'Unidade inválida.'; end if;
  cap := public.inv_capacity(p_id);
  taken := jsonb_build_object('id', p_id, 'qty', p_qty);
  if e ? 'custom' then taken := taken || jsonb_build_object('custom', e->'custom'); end if;
  if cap is not null then
    fills := public.inv_norm_fills(e->'fills', q, cap);
    if p_index is not null then
      taken := taken || jsonb_build_object('fills', jsonb_build_array(fills -> p_index));
      kept := fills - p_index;
    else -- sem índice saem as últimas unidades (e os níveis delas)
      taken := taken || jsonb_build_object('fills', coalesce((select jsonb_agg(v order by o) from jsonb_array_elements(fills) with ordinality t(v, o) where o > q - p_qty), '[]'::jsonb));
      kept := coalesce((select jsonb_agg(v order by o) from jsonb_array_elements(fills) with ordinality t(v, o) where o <= q - p_qty), '[]'::jsonb);
    end if;
  end if;
  if q - p_qty < 1 then
    if (e ? 'custom') and not p_custom_last_ok then
      raise exception 'Para tirar o último exemplar de um item customizado use Descartar.';
    end if;
    return jsonb_build_object('inv', p_inv - i, 'taken', taken);
  end if;
  e := jsonb_set(e, '{qty}', to_jsonb(q - p_qty));
  if cap is not null then e := jsonb_set(e, '{fills}', kept); end if;
  return jsonb_build_object('inv', jsonb_set(p_inv, array[i::text], e), 'taken', taken);
end $$;

-- Põe o que saiu de outra mochila (ou o item entregue pelo mestre) nesta: agrupa se já existe, senão cria a entrada.
create or replace function public.inv_put(p_inv jsonb, p_taken jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare i int; e jsonb; q int; n int; cap numeric; v_id text;
begin
  v_id := p_taken->>'id';
  n := (p_taken->>'qty')::int;
  cap := public.inv_capacity(v_id);
  i := public.inv_idx(p_inv, v_id);
  if i < 0 then
    if jsonb_array_length(p_inv) >= 300 then raise exception 'A mochila do destinatário está cheia.'; end if;
    e := jsonb_build_object('id', v_id, 'qty', n, 'equipped', false);
    if p_taken ? 'custom' then e := e || jsonb_build_object('custom', p_taken->'custom'); end if;
    if cap is not null then e := e || jsonb_build_object('fills', public.inv_norm_fills(p_taken->'fills', n, cap)); end if;
    return p_inv || jsonb_build_array(e);
  end if;
  e := p_inv -> i;
  q := public.sheet_int(e, 'qty', 0)::int;
  if q + n > 99 then raise exception 'O destinatário não pode carregar mais de 99 unidades deste item.'; end if;
  if cap is not null then
    e := jsonb_set(e, '{fills}', public.inv_norm_fills(e->'fills', q, cap) || public.inv_norm_fills(p_taken->'fills', n, cap));
  end if;
  e := jsonb_set(e, '{qty}', to_jsonb(q + n));
  return jsonb_set(p_inv, array[i::text], e);
end $$;

-- Dono da ficha, ou o mestre da mesa à qual a ficha pertence.
create or replace function public.inv_can_edit(p_character uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.characters c
    where c.id = p_character and (c.owner_id = auth.uid() or (c.table_id is not null and public.is_gm(c.table_id)))
  );
$$;

-- ---------- funções que o app chama ----------

-- Gastar unidades (só diminui). p_index: qual unidade sai (cantil: sai o nível dela); sem p_index sai a última.
create or replace function public.inventory_consume(p_character uuid, p_id text, p_qty int default 1, p_index int default null) returns void
language plpgsql security definer set search_path = public as $$
declare d jsonb; r jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if not public.inv_can_edit(p_character) then raise exception 'Você não pode alterar esta mochila.'; end if;
  select data into d from public.characters where id = p_character for update;
  r := public.inv_take(public.inv_get(d), p_id, p_qty, p_index, false);
  update public.characters set data = jsonb_set(d, '{inventory}', r->'inv') where id = p_character;
end $$;

-- Nível de uma unidade de cantil (0 a 1 L, passos de 0,05).
create or replace function public.inventory_set_fill(p_character uuid, p_id text, p_index int, p_fill numeric) returns void
language plpgsql security definer set search_path = public as $$
declare d jsonb; inv jsonb; i int; e jsonb; q int; cap numeric; fills jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if not public.inv_can_edit(p_character) then raise exception 'Você não pode alterar esta mochila.'; end if;
  cap := public.inv_capacity(p_id);
  if cap is null then raise exception 'Este item não guarda líquido.'; end if;
  if p_fill is null then raise exception 'Informe o volume.'; end if;
  select data into d from public.characters where id = p_character for update;
  inv := public.inv_get(d);
  i := public.inv_idx(inv, p_id);
  if i < 0 then raise exception 'Este item não está na mochila (ou a ficha ainda não foi salva).'; end if;
  e := inv -> i;
  q := public.sheet_int(e, 'qty', 0)::int;
  if p_index is null or p_index < 0 or p_index >= q then raise exception 'Unidade inválida.'; end if;
  fills := jsonb_set(public.inv_norm_fills(e->'fills', q, cap), array[p_index::text], to_jsonb(trim_scale(round(least(cap, greatest(0, p_fill)) * 20) / 20)));
  inv := jsonb_set(inv, array[i::text], jsonb_set(e, '{fills}', fills));
  update public.characters set data = jsonb_set(d, '{inventory}', inv) where id = p_character;
end $$;

-- Transferência atômica entre dois personagens aprovados da mesma mesa.
create or replace function public.inventory_transfer(p_table uuid, p_from uuid, p_to uuid, p_id text, p_qty int, p_index int default null) returns void
language plpgsql security definer set search_path = public as $$
declare d_from jsonb; d_to jsonb; r jsonb; v_taken jsonb; v_name text; v_uuid uuid; owner_from uuid; owner_to uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_from = p_to then raise exception 'Escolha outro personagem como destinatário.'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Informe uma quantidade de 1 ou mais.'; end if;
  if not (public.my_character_in(p_table, p_from) or public.is_gm(p_table)) then
    raise exception 'Você só pode enviar itens do seu próprio personagem.';
  end if;
  if exists (select 1 from public.tables where id = p_table and status::text = 'closed') then
    raise exception 'Esta mesa foi encerrada.';
  end if;
  if (select count(*) from public.table_members
      where table_id = p_table and status = 'approved' and character_id in (p_from, p_to)) <> 2 then
    raise exception 'Os dois personagens precisam estar aprovados na mesma mesa.';
  end if;
  -- lock das duas fichas sempre na mesma ordem (sem deadlock entre transferências simultâneas)
  perform 1 from public.characters where id in (p_from, p_to) order by id for update;
  select data, owner_id into d_from, owner_from from public.characters where id = p_from;
  select data, owner_id into d_to, owner_to from public.characters where id = p_to;
  if d_from is null or d_to is null then raise exception 'Ficha não encontrada.'; end if;
  r := public.inv_take(public.inv_get(d_from), p_id, p_qty, p_index, true);
  v_taken := r->'taken';
  v_name := coalesce(v_taken->'custom'->>'name', '');
  update public.characters set data = jsonb_set(d_from, '{inventory}', r->'inv') where id = p_from;
  update public.characters set data = jsonb_set(d_to, '{inventory}', public.inv_put(public.inv_get(d_to), v_taken)) where id = p_to;
  if p_id ~ '^custom-[0-9a-f-]{36}$' then
    v_uuid := substr(p_id, 8)::uuid;
    if public.inv_idx(r->'inv', p_id) < 0 then -- o último exemplar saiu: a reposição automática do solicitante não deve devolvê-lo
      update public.table_custom_items set discarded_at = now()
        where id = v_uuid and user_id = owner_from and discarded_at is null;
    end if;
    update public.table_custom_items set discarded_at = null -- voltou ao solicitante original
      where id = v_uuid and user_id = owner_to and discarded_at is not null;
  end if;
  insert into public.inventory_log (table_id, actor_id, from_character, to_character, item_id, item_name, qty, kind)
  values (p_table, auth.uid(), p_from, p_to, p_id, left(v_name, 80), p_qty, 'transfer');
end $$;

-- O mestre entrega item do catálogo (p_id) ou um item customizado novo (p_custom) a um personagem aprovado da mesa.
create or replace function public.gm_give_item(p_table uuid, p_character uuid, p_id text, p_custom jsonb, p_qty int) returns void
language plpgsql security definer set search_path = public as $$
declare d jsonb; v_id text; taken jsonb; custom jsonb; v_name text; w numeric; v_effects jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode entregar itens.'; end if;
  if p_qty is null or p_qty < 1 or p_qty > 99 then raise exception 'Informe uma quantidade de 1 a 99.'; end if;
  if not exists (select 1 from public.table_members where table_id = p_table and character_id = p_character and status = 'approved') then
    raise exception 'Este personagem não está vinculado a um jogador aprovado da mesa.';
  end if;
  if p_custom is not null and jsonb_typeof(p_custom) = 'object' then
    v_name := left(btrim(coalesce(p_custom->>'name', '')), 80);
    if v_name = '' then raise exception 'Dê um nome ao item.'; end if;
    w := case when p_custom->>'weight' ~ '^[0-9]+(\.[0-9]+)?$' then least(500, round((p_custom->>'weight')::numeric, 2)) else 0 end;
    select coalesce(jsonb_agg(jsonb_build_object('kind', e->>'kind', 'target', left(coalesce(e->>'target', ''), 60), 'bonus', public.sheet_int(e, 'bonus', 0)) order by o), '[]'::jsonb)
      into v_effects
      from (select e, o from jsonb_array_elements(case when jsonb_typeof(p_custom->'effects') = 'array' then p_custom->'effects' else '[]'::jsonb end) with ordinality t(e, o)
            where jsonb_typeof(e) = 'object' and e->>'kind' in ('attribute', 'skill', 'derived', 'damage') order by o limit 8) s;
    custom := jsonb_build_object('name', v_name, 'weight', w, 'effects', v_effects, 'description', left(coalesce(p_custom->>'description', ''), 1000));
    v_id := 'custom-' || gen_random_uuid()::text;
    taken := jsonb_build_object('id', v_id, 'qty', p_qty, 'custom', custom);
  elsif p_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(p_id) <= 120 and p_id not like 'custom-%' then
    v_id := p_id;
    v_name := '';
    taken := jsonb_build_object('id', v_id, 'qty', p_qty);
  else
    raise exception 'Item inválido.';
  end if;
  select data into d from public.characters where id = p_character for update;
  if d is null then raise exception 'Ficha não encontrada.'; end if;
  update public.characters set data = jsonb_set(d, '{inventory}', public.inv_put(public.inv_get(d), taken)) where id = p_character;
  insert into public.inventory_log (table_id, actor_id, from_character, to_character, item_id, item_name, qty, kind)
  values (p_table, auth.uid(), null, p_character, v_id, left(v_name, 80), p_qty, 'gm_give');
end $$;

revoke all on function public.inv_capacity(text), public.inv_get(jsonb), public.inv_idx(jsonb, text),
  public.inv_norm_fills(jsonb, int, numeric), public.inv_take(jsonb, text, int, int, boolean),
  public.inv_put(jsonb, jsonb), public.inv_can_edit(uuid) from public, anon, authenticated;
revoke all on function public.inventory_consume(uuid, text, int, int) from public, anon;
revoke all on function public.inventory_set_fill(uuid, text, int, numeric) from public, anon;
revoke all on function public.inventory_transfer(uuid, uuid, uuid, text, int, int) from public, anon;
revoke all on function public.gm_give_item(uuid, uuid, text, jsonb, int) from public, anon;
grant execute on function public.inventory_consume(uuid, text, int, int) to authenticated;
grant execute on function public.inventory_set_fill(uuid, text, int, numeric) to authenticated;
grant execute on function public.inventory_transfer(uuid, uuid, uuid, text, int, int) to authenticated;
grant execute on function public.gm_give_item(uuid, uuid, text, jsonb, int) to authenticated;
