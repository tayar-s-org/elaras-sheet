-- Itens customizados: o jogador pede um item (nome, peso, efeitos, descricao), o mestre da mesa aprova ou recusa; o app do
-- jogador recolhe os aprovados (claim_custom_items) e os poe na mochila da ficha. Leitura: o dono e o mestre.
--
-- ATENCAO: este arquivo ficou VAZIO (0 bytes) no repositorio. Foi RECONSTRUIDO a partir do banco publicado (catalogos do
-- Postgres: colunas, constraints, indices, politicas, gatilhos e funcoes) e das referencias das migracoes 0021, 0039, 0040,
-- 0041, 0043 e 0044. Antes de confiar nele em outro banco, compare com o esquema publicado.
--
-- Fica de fora de proposito o que a 0021 acrescenta (colunas price e discarded_at, approve/revoke/discard_custom_item) e o
-- que a 0044 acrescenta (gatilho custom_item_to_shop). Assim a 0018 vem antes da 0021 num banco novo.
-- Pode ser repetida (if not exists / create or replace / drop ... if exists).
-- Os privilegios da tabela sao os padroes do Supabase (anon/authenticated/service_role); a protecao e a RLS abaixo.

create table if not exists public.table_custom_items (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  character_id uuid references public.characters(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  weight numeric not null default 0 check (weight between 0 and 500),
  effects jsonb not null default '[]'::jsonb check (jsonb_typeof(effects) = 'array' and pg_column_size(effects) < 4096),
  description text not null default '' check (char_length(description) <= 1000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  gm_note text not null default '' check (char_length(gm_note) <= 300),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists table_custom_items_table_idx on public.table_custom_items (table_id, status, created_at desc);
create index if not exists table_custom_items_user_idx on public.table_custom_items (user_id, created_at desc);
alter table public.table_custom_items enable row level security;

drop policy if exists custom_items_select on public.table_custom_items;
create policy custom_items_select on public.table_custom_items for select to authenticated
  using (user_id = auth.uid() or public.is_gm(table_id));
drop policy if exists custom_items_insert on public.table_custom_items;
create policy custom_items_insert on public.table_custom_items for insert to authenticated
  with check (
    user_id = auth.uid() and public.is_member(table_id)
    and (character_id is null or exists (select 1 from public.characters c where c.id = character_id and c.owner_id = auth.uid()))
  );
drop policy if exists custom_items_update on public.table_custom_items;
create policy custom_items_update on public.table_custom_items for update to authenticated
  using (public.is_gm(table_id)) with check (public.is_gm(table_id));
drop policy if exists custom_items_delete on public.table_custom_items;
create policy custom_items_delete on public.table_custom_items for delete to authenticated
  using (user_id = auth.uid() and status = 'pending');

-- Novo pedido sempre nasce pendente; cada jogador tem no maximo 10 pendentes por mesa.
create or replace function public.custom_items_before_insert() returns trigger
language plpgsql as $$
begin
  new.status := 'pending'; new.gm_note := ''; new.delivered_at := null; new.decided_at := null;
  if (select count(*) from public.table_custom_items
      where table_id = new.table_id and user_id = new.user_id and status = 'pending') >= 10 then
    raise exception 'Você já tem 10 itens aguardando aprovação nesta mesa.';
  end if;
  return new;
end $$;
drop trigger if exists custom_items_before_insert on public.table_custom_items;
create trigger custom_items_before_insert before insert on public.table_custom_items
  for each row execute function public.custom_items_before_insert();

-- Na decisao o mestre so altera status e anotacao.
create or replace function public.custom_items_before_update() returns trigger
language plpgsql as $$
begin
  new.table_id := old.table_id; new.user_id := old.user_id; new.character_id := old.character_id;
  new.name := old.name; new.weight := old.weight; new.effects := old.effects; new.description := old.description;
  new.created_at := old.created_at;
  -- delivered_at so muda pela funcao de recolher (claim_custom_items), que liga este sinal.
  if coalesce(current_setting('app.custom_claim', true), '') <> '1' then new.delivered_at := old.delivered_at; end if;
  if new.status is distinct from old.status then new.decided_at := now(); end if;
  return new;
end $$;
drop trigger if exists custom_items_before_update on public.table_custom_items;
create trigger custom_items_before_update before update on public.table_custom_items
  for each row execute function public.custom_items_before_update();

-- O dono da ficha recolhe os itens aprovados ainda nao entregues; o app os poe na mochila.
create or replace function public.claim_custom_items(p_character uuid)
returns table (id uuid, name text, weight numeric, effects jsonb, description text)
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.characters c where c.id = p_character and c.owner_id = auth.uid()) then
    raise exception 'Ficha inválida.';
  end if;
  perform set_config('app.custom_claim', '1', true);
  return query
    update public.table_custom_items t set delivered_at = now()
    where t.character_id = p_character and t.user_id = auth.uid() and t.status = 'approved' and t.delivered_at is null
    returning t.id, t.name, t.weight, t.effects, t.description;
end $$;
revoke all on function public.claim_custom_items(uuid) from public, anon;
