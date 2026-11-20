-- 0050: aprovar e revogar item customizado sem saldo furado nem movimentação duplicada.
--
-- Problemas da 0021 (approve_custom_item / revoke_custom_item), que esta migração corrige:
--  * aprovar só CONFERIA o saldo e deixava a cobrança numa fila; até o app do jogador recolhê-la, o saldo da ficha não mudava.
--    Um jogador offline com $ 500 podia ter dois itens de $ 400 aprovados em sequência;
--  * duas sessões do mestre (aprovar+aprovar ou aprovar+revogar) liam o mesmo estado sem lock e as duas gravavam cobrança/reembolso.
--
-- Agora, na mesma transação: lock da ficha e do pedido, conferência do estado já com o lock (o pedido só muda de estado uma vez),
-- débito/reembolso direto em characters.data.money e uma linha já resgatada em money_awards (mesmo formato de grant_money e
-- gm_adjust_money, então o jogador vê a mudança na hora e a ficha aberta reconcilia por useRewardSync/sheetRebase).
-- A cobrança e o reembolso são idempotentes porque só acontecem na transição pending→approved e approved→rejected, que só uma
-- transação consegue fazer.
--
-- Ordem dos locks: ficha e depois pedido, a mesma de inventory_transfer (0039), que trava a ficha e depois marca discarded_at no
-- pedido. Assim as duas operações nunca se esperam em círculo.
--
-- Mesmas assinaturas, regras e mensagens da 0021. Cobranças antigas ainda não resgatadas em money_awards continuam sendo
-- recolhidas pelo app como antes. Reescreve duas funções em uso (create or replace); pode ser repetida.

-- Interno: devolve o pedido já travado (ficha antes, pedido depois).
create or replace function public.lock_custom_item_request(p_id uuid) returns public.table_custom_items
language plpgsql security definer set search_path = public as $$
declare r public.table_custom_items;
begin
  select * into r from public.table_custom_items where id = p_id;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  perform 1 from public.characters where id = r.character_id for update;
  select * into r from public.table_custom_items where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  return r;
end $$;

create or replace function public.approve_custom_item(p_id uuid, p_price int, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.table_custom_items;
  balance bigint;
begin
  r := public.lock_custom_item_request(p_id);
  if not public.is_gm(r.table_id) then raise exception 'Apenas o mestre pode aprovar itens.'; end if;
  if r.status <> 'pending' then raise exception 'Este pedido já foi decidido.'; end if;
  if p_price is null or p_price < 0 or p_price > 1000000 then raise exception 'Informe um preço de 0 a 1.000.000.'; end if;
  if p_price > 0 then
    if r.character_id is null then raise exception 'O pedido não tem personagem para cobrar.'; end if;
    -- ficha antiga sem o campo conta como 500 (igual ao app e a grant_money)
    select least(999999999, greatest(0, public.sheet_int(c.data, 'money', 500))) into balance
    from public.characters c where c.id = r.character_id;
    if coalesce(balance, 0) < p_price then
      raise exception 'O jogador só tem $ % e o item custa $ %.', coalesce(balance, 0), p_price;
    end if;
    update public.characters set data = jsonb_set(data, '{money}', to_jsonb(balance - p_price)) where id = r.character_id;
    insert into public.money_awards (table_id, character_id, amount, note, claimed_at)
    values (r.table_id, r.character_id, -p_price, left('Item: ' || r.name, 200), now());
  end if;
  update public.table_custom_items
    set status = 'approved', price = p_price, gm_note = left(coalesce(p_note, ''), 300)
    where id = p_id;
end $$;

create or replace function public.revoke_custom_item(p_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r public.table_custom_items;
begin
  r := public.lock_custom_item_request(p_id);
  if not public.is_gm(r.table_id) then raise exception 'Apenas o mestre pode revogar itens.'; end if;
  if r.status <> 'approved' then raise exception 'Só dá para revogar um item aprovado.'; end if;
  if r.price > 0 and r.character_id is not null then
    update public.characters
      set data = jsonb_set(data, '{money}', to_jsonb(least(999999999, greatest(0, public.sheet_int(data, 'money', 500)) + r.price)))
      where id = r.character_id;
    insert into public.money_awards (table_id, character_id, amount, note, claimed_at)
    values (r.table_id, r.character_id, r.price, left('Reembolso: ' || r.name, 200), now());
  end if;
  update public.table_custom_items
    set status = 'rejected', gm_note = left(coalesce(p_note, ''), 300)
    where id = p_id;
end $$;

revoke all on function public.lock_custom_item_request(uuid) from public, anon, authenticated;
revoke all on function public.approve_custom_item(uuid, int, text) from public, anon;
revoke all on function public.revoke_custom_item(uuid, text) from public, anon;
