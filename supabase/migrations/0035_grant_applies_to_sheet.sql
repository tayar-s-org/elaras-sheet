-- 0035: o XP e o dinheiro que o mestre concede entram na ficha NA HORA, mesmo com o app do jogador fechado.
--
-- Antes (0009/0012/0013): grant_xp/grant_money só entravam numa fila (xp_awards/money_awards) e o app do jogador somava na ficha
-- quando estava aberto. Agora as duas funções também gravam o valor direto em characters.data (xp / money) e marcam a concessão
-- como recebida (claimed_at), então o registro da mesa mostra "entregue" e o app do jogador só precisa atualizar a ficha que tem
-- aberta (useRewardSync, que soma a diferença sem conflito de revisão).
--
-- Mesmas regras de antes (só o mestre; ficha de jogador aprovado na mesa; limites de valor; dinheiro nunca abaixo de 0 nem acima de
-- 999.999.999; XP até 1.000.000). As outras concessões da fila (loja, salário, treino, aptidão) continuam sendo recolhidas pelo app.
-- Reescreve grant_xp e grant_money (create or replace, mesma assinatura); pode ser repetida.
--
-- ORDEM: publique o app novo (que já entende essa mudança) antes de rodar esta migração, senão um app antigo aberto estranha a
-- ficha ter mudado na nuvem ("mudou em outro lugar") até recarregar a página.

-- Número inteiro de um campo da ficha (aceita número ou texto numérico); nulo, vazio ou inválido vira o padrão.
create or replace function public.sheet_int(d jsonb, k text, dflt bigint) returns bigint
language sql immutable as $$
  select case
    when d->k is null or jsonb_typeof(d->k) = 'null' or d->>k = '' then dflt
    when d->>k ~ '^-?[0-9]+(\.[0-9]+)?$' then trunc((d->>k)::numeric)::bigint
    else 0
  end;
$$;

create or replace function public.grant_xp(p_table uuid, p_character uuid, p_amount int, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode conceder experiência.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then raise exception 'Informe um valor de XP entre 1 e 10000.'; end if;
  if not exists (
    select 1 from public.table_members
    where table_id = p_table and character_id = p_character and status = 'approved'
  ) then raise exception 'Esta ficha não está vinculada a um jogador da mesa.'; end if;
  -- Aplica na ficha (o gatilho characters_before_update sobe a revisão).
  update public.characters
    set data = jsonb_set(data, '{xp}', to_jsonb(least(1000000, greatest(0, public.sheet_int(data, 'xp', 0)) + p_amount)))
    where id = p_character;
  insert into public.xp_awards (table_id, character_id, amount, note, claimed_at)
  values (p_table, p_character, p_amount, left(coalesce(p_note, ''), 200), now());
end $$;

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
  -- Ficha antiga sem o campo conta como 500 (igual ao app); o saldo fica entre 0 e 999.999.999.
  update public.characters
    set data = jsonb_set(data, '{money}', to_jsonb(least(999999999, greatest(0, least(999999999, greatest(0, public.sheet_int(data, 'money', 500))) + p_amount))))
    where id = p_character;
  insert into public.money_awards (table_id, character_id, amount, note, claimed_at)
  values (p_table, p_character, p_amount, left(coalesce(p_note, ''), 200), now());
end $$;

revoke all on function public.grant_xp(uuid, uuid, int, text) from public, anon;
revoke all on function public.grant_money(uuid, uuid, int, text) from public, anon;
