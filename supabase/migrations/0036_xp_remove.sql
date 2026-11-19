-- 0036: o mestre também pode REMOVER XP de um jogador (valor negativo em grant_xp), como já podia com o dinheiro (0013).
-- O XP da ficha nunca fica abaixo de 0; o registro da mesa guarda o valor com sinal. Depende da 0035. Pode ser repetida.

alter table public.xp_awards drop constraint if exists xp_awards_amount_check;
alter table public.xp_awards add constraint xp_awards_amount_check
  check (amount between -10000 and 10000 and amount <> 0);

create or replace function public.grant_xp(p_table uuid, p_character uuid, p_amount int, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode alterar a experiência.'; end if;
  if p_amount is null or p_amount = 0 or abs(p_amount) > 10000 then raise exception 'Informe um valor de XP de 1 a 10000 (negativo remove).'; end if;
  if not exists (
    select 1 from public.table_members
    where table_id = p_table and character_id = p_character and status = 'approved'
  ) then raise exception 'Esta ficha não está vinculada a um jogador da mesa.'; end if;
  update public.characters
    set data = jsonb_set(data, '{xp}', to_jsonb(least(1000000, greatest(0, greatest(0, public.sheet_int(data, 'xp', 0)) + p_amount))))
    where id = p_character;
  insert into public.xp_awards (table_id, character_id, amount, note, claimed_at)
  values (p_table, p_character, p_amount, left(coalesce(p_note, ''), 200), now());
end $$;

revoke all on function public.grant_xp(uuid, uuid, int, text) from public, anon;
