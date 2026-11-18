-- Pericias personalizadas: o jogador pede uma pericia nova (nome e dado), o mestre da mesa aprova ou recusa; o app do
-- jogador recolhe as aprovadas (claim_custom_skills) e as grava na ficha. Leitura: o dono e o mestre.

create table public.table_custom_skills (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  name text not null check (char_length(name) between 1 and 40),
  die int not null check (die in (4, 6, 8, 10, 12)),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  gm_note text not null default '' check (char_length(gm_note) <= 300),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index table_custom_skills_table_idx on public.table_custom_skills (table_id, status, created_at desc);
create index table_custom_skills_user_idx on public.table_custom_skills (user_id, created_at desc);
alter table public.table_custom_skills enable row level security;

create policy "custom_skills_select" on public.table_custom_skills for select to authenticated
  using (user_id = auth.uid() or public.is_gm(table_id));
create policy "custom_skills_insert" on public.table_custom_skills for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_member(table_id)
    and (character_id is null or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()))
  );
create policy "custom_skills_update" on public.table_custom_skills for update to authenticated
  using (public.is_gm(table_id)) with check (public.is_gm(table_id));
create policy "custom_skills_delete" on public.table_custom_skills for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- Novo pedido sempre nasce pendente; cada jogador tem no maximo 10 pendentes por mesa.
create function public.custom_skills_before_insert() returns trigger
language plpgsql as $$
begin
  new.name := btrim(new.name);
  new.status := 'pending'; new.gm_note := ''; new.delivered_at := null; new.decided_at := null;
  if (select count(*) from public.table_custom_skills
      where table_id = new.table_id and user_id = new.user_id and status = 'pending') >= 10 then
    raise exception 'Você já tem 10 perícias aguardando aprovação nesta mesa.';
  end if;
  return new;
end $$;
create trigger custom_skills_before_insert before insert on public.table_custom_skills
  for each row execute function public.custom_skills_before_insert();

-- Na decisao o mestre so altera status e anotacao.
create function public.custom_skills_before_update() returns trigger
language plpgsql as $$
begin
  new.table_id := old.table_id; new.user_id := old.user_id; new.character_id := old.character_id;
  new.name := old.name; new.die := old.die; new.created_at := old.created_at;
  if coalesce(current_setting('app.custom_skill_claim', true), '') <> '1' then new.delivered_at := old.delivered_at; end if;
  if new.status is distinct from old.status then new.decided_at := now(); end if;
  return new;
end $$;
create trigger custom_skills_before_update before update on public.table_custom_skills
  for each row execute function public.custom_skills_before_update();

-- O dono da ficha recolhe as pericias aprovadas ainda nao entregues; o app as coloca na ficha.
create function public.claim_custom_skills(p_character uuid)
returns table (id uuid, name text, die int)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.characters c where c.id = p_character and c.owner_id = auth.uid()) then
    raise exception 'Ficha inválida.';
  end if;
  perform set_config('app.custom_skill_claim', '1', true);
  return query
    update public.table_custom_skills t set delivered_at = now()
    where t.character_id = p_character and t.user_id = auth.uid() and t.status = 'approved' and t.delivered_at is null
    returning t.id, t.name, t.die;
end $$;
revoke all on function public.claim_custom_skills(uuid) from public, anon;
