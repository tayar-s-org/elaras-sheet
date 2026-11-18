-- O mestre tambem pode remover dinheiro dos jogadores: a fila de dinheiro (0012) passa a aceitar valores
-- negativos. O app do jogador soma os valores recolhidos (positivos e negativos) e o saldo nunca fica abaixo de 0.
-- claim_money continua igual: devolve a soma (agora com sinal) e marca tudo como recebido.

alter table public.money_awards drop constraint if exists money_awards_amount_check;
alter table public.money_awards add constraint money_awards_amount_check
  check (amount between -1000000 and 1000000 and amount <> 0);

create or replace function public.grant_money(p_table uuid, p_character uuid, p_amount int, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode alterar o dinheiro.'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then
    raise exception 'Informe um valor de 1 a 1.000.000 (negativo remove).';
  end if;
  if not exists (
    select 1 from public.table_members
    where table_id = p_table and character_id = p_character and status = 'approved'
  ) then raise exception 'Esta ficha não está vinculada a um jogador da mesa.'; end if;
  insert into public.money_awards (table_id, character_id, amount, note)
  values (p_table, p_character, p_amount, left(coalesce(p_note, ''), 200));
end $$;
