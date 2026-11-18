-- Fase 5d: o mestre concede XP aos jogadores. A ficha pertence ao jogador (RLS), entao o XP fica numa fila
-- (xp_awards) e o proprio app do jogador aplica na ficha e marca como recebido (claim_xp), sem conflito de versao.

create table public.xp_awards (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  amount int not null check (amount between 1 and 10000),
  note text not null default '' check (char_length(note) <= 200),
  granted_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz
);
create index xp_awards_pending_idx on public.xp_awards (character_id) where claimed_at is null;
alter table public.xp_awards enable row level security;

-- Leitura: o mestre da mesa e o dono da ficha. Ninguem escreve direto: so as funcoes abaixo.
create policy "xp_awards_select" on public.xp_awards for select to authenticated
  using (public.is_gm(table_id)
    or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()));

create function public.grant_xp(p_table uuid, p_character uuid, p_amount int, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode conceder experiência.'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 10000 then raise exception 'Informe um valor de XP entre 1 e 10000.'; end if;
  if not exists (
    select 1 from public.table_members
    where table_id = p_table and character_id = p_character and status = 'approved'
  ) then raise exception 'Esta ficha não está vinculada a um jogador da mesa.'; end if;
  insert into public.xp_awards (table_id, character_id, amount, note)
  values (p_table, p_character, p_amount, left(coalesce(p_note, ''), 200));
end $$;

-- O dono da ficha recebe o XP pendente: marca como recebido e devolve o total para o app somar na ficha.
create function public.claim_xp(p_character uuid) returns int
language plpgsql security definer set search_path = public as $$
declare total int;
begin
  if not exists (select 1 from public.characters where id = p_character and owner_id = auth.uid()) then
    raise exception 'Ficha inválida.';
  end if;
  with taken as (
    update public.xp_awards set claimed_at = now()
    where character_id = p_character and claimed_at is null
    returning amount
  )
  select coalesce(sum(amount), 0) into total from taken;
  return total;
end $$;

revoke all on function public.grant_xp(uuid, uuid, int, text) from public, anon;
revoke all on function public.claim_xp(uuid) from public, anon;
