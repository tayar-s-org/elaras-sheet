-- Itens customizados: preco definido pelo mestre na aprovacao (descontado do dinheiro do jogador),
-- reembolso ao revogar e entrega a prova de falhas.
--
-- Preco: approve_custom_item aprova, grava o preco e, se for maior que 0, tira o valor do jogador pela fila de
-- dinheiro (money_awards, valor negativo; o app do jogador desconta da ficha). So aprova se o jogador tem saldo.
-- Revogar (revoke_custom_item) devolve o preco pela mesma fila.
--
-- Entrega: antes, o item so era entregue uma vez (delivered_at). Se a aba que o recolheu fechasse ou travasse por
-- conflito antes de salvar a ficha, o item sumia. Agora o app confere os itens aprovados contra a mochila e repoe os
-- que faltam, a menos que o jogador os tenha descartado (discarded_at, marcado por discard_custom_item).

alter table public.table_custom_items
  add column price int not null default 0 check (price between 0 and 1000000),
  add column discarded_at timestamptz;

create function public.approve_custom_item(p_id uuid, p_price int, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  r public.table_custom_items%rowtype;
  balance numeric;
begin
  select * into r from public.table_custom_items where id = p_id;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.is_gm(r.table_id) then raise exception 'Apenas o mestre pode aprovar itens.'; end if;
  if r.status <> 'pending' then raise exception 'Este pedido já foi decidido.'; end if;
  if p_price is null or p_price < 0 or p_price > 1000000 then raise exception 'Informe um preço de 0 a 1.000.000.'; end if;
  if p_price > 0 then
    if r.character_id is null then raise exception 'O pedido não tem personagem para cobrar.'; end if;
    -- ficha antiga sem o campo conta como 500 (igual ao app)
    select case when c.data ? 'money' then (c.data->>'money')::numeric else 500 end into balance
    from public.characters c where c.id = r.character_id;
    if coalesce(balance, 0) < p_price then
      raise exception 'O jogador só tem $ % e o item custa $ %.', coalesce(balance, 0), p_price;
    end if;
  end if;
  update public.table_custom_items
    set status = 'approved', price = p_price, gm_note = left(coalesce(p_note, ''), 300)
    where id = p_id;
  if p_price > 0 then
    insert into public.money_awards (table_id, character_id, amount, note)
    values (r.table_id, r.character_id, -p_price, left('Item: ' || r.name, 200));
  end if;
end $$;

create function public.revoke_custom_item(p_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare r public.table_custom_items%rowtype;
begin
  select * into r from public.table_custom_items where id = p_id;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if not public.is_gm(r.table_id) then raise exception 'Apenas o mestre pode revogar itens.'; end if;
  if r.status <> 'approved' then raise exception 'Só dá para revogar um item aprovado.'; end if;
  update public.table_custom_items
    set status = 'rejected', gm_note = left(coalesce(p_note, ''), 300)
    where id = p_id;
  if r.price > 0 and r.character_id is not null then
    insert into public.money_awards (table_id, character_id, amount, note)
    values (r.table_id, r.character_id, r.price, left('Reembolso: ' || r.name, 200));
  end if;
end $$;

-- O dono descarta o item da mochila: ele nao deve ser reposto pela conferencia.
create function public.discard_custom_item(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.table_custom_items set discarded_at = now()
  where id = p_id and user_id = auth.uid() and discarded_at is null;
end $$;

revoke all on function public.approve_custom_item(uuid, int, text) from public, anon;
revoke all on function public.revoke_custom_item(uuid, text) from public, anon;
revoke all on function public.discard_custom_item(uuid) from public, anon;
