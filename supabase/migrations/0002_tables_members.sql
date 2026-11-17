-- Fase 2: mesas, participantes, pedidos de entrada, convites. Tudo protegido por RLS;
-- escritas em table_members acontecem apenas pelas funcoes abaixo (SECURITY DEFINER).

create type public.table_visibility as enum ('public', 'private');
create type public.table_status as enum ('open', 'running', 'closed');
create type public.member_role as enum ('gm', 'player');
create type public.member_status as enum ('pending', 'approved', 'rejected', 'kicked', 'left');

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  description text not null default '' check (char_length(description) <= 2000),
  system text not null default 'sw',
  visibility public.table_visibility not null default 'private',
  status public.table_status not null default 'open',
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  auto_approve boolean not null default false,
  max_players int not null default 6 check (max_players between 1 and 20),
  created_at timestamptz not null default now()
);
create index tables_owner_idx on public.tables (owner_id);

create table public.table_members (
  table_id uuid not null references public.tables(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.member_role not null default 'player',
  status public.member_status not null default 'pending',
  character_id uuid references public.characters(id) on delete set null,
  message text not null default '' check (char_length(message) <= 300),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (table_id, user_id)
);
create index table_members_user_idx on public.table_members (user_id);

-- Helpers (SECURITY DEFINER evitam recursao entre policies).
create function public.is_gm(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tables where id = t and owner_id = auth.uid());
$$;
create function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.table_members
                 where table_id = t and user_id = auth.uid() and status = 'approved');
$$;
create function public.is_involved(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.table_members
                 where table_id = t and user_id = auth.uid() and status in ('pending', 'approved'));
$$;

alter table public.tables enable row level security;
alter table public.table_members enable row level security;

create policy "tables_select" on public.tables for select to authenticated
  using (visibility = 'public' or owner_id = auth.uid() or public.is_involved(id));
create policy "tables_insert" on public.tables for insert to authenticated
  with check (owner_id = auth.uid());
create policy "tables_update_gm" on public.tables for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "tables_delete_gm" on public.tables for delete to authenticated
  using (owner_id = auth.uid());

-- Sem policies de INSERT/UPDATE/DELETE em table_members: so as funcoes escrevem.
create policy "members_select" on public.table_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_gm(table_id)
    or (status = 'approved' and public.is_member(table_id))
  );

-- O mestre entra automaticamente como membro 'gm'.
create function public.tables_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.table_members (table_id, user_id, role, status, decided_at)
  values (new.id, new.owner_id, 'gm', 'approved', now());
  return new;
end $$;
create trigger tables_after_insert after insert on public.tables
  for each row execute function public.tables_after_insert();

-- Nao permite trocar o dono da mesa.
create function public.tables_before_update() returns trigger
language plpgsql as $$
begin
  new.owner_id := old.owner_id;
  return new;
end $$;
create trigger tables_before_update before update on public.tables
  for each row execute function public.tables_before_update();

-- Logica comum de entrada.
create function public._join_table(t uuid, p_message text, p_character uuid) returns public.member_status
language plpgsql security definer set search_path = public as $$
declare
  tbl public.tables;
  cur public.table_members;
  next_status public.member_status;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  select * into tbl from public.tables where id = t;
  if not found then raise exception 'Mesa não encontrada.'; end if;
  if tbl.status = 'closed' then raise exception 'Esta mesa está encerrada.'; end if;
  if p_character is not null and not exists (
    select 1 from public.characters where id = p_character and owner_id = auth.uid()
  ) then raise exception 'Ficha inválida.'; end if;

  select * into cur from public.table_members where table_id = t and user_id = auth.uid();
  if found then
    if cur.status = 'kicked' then raise exception 'Você foi removido desta mesa.'; end if;
    if cur.status in ('pending', 'approved') then return cur.status; end if;
  end if;

  next_status := case when tbl.auto_approve then 'approved' else 'pending' end;
  if next_status = 'approved' and (
    select count(*) from public.table_members
    where table_id = t and role = 'player' and status = 'approved'
  ) >= tbl.max_players then
    next_status := 'pending';
  end if;

  insert into public.table_members (table_id, user_id, role, status, character_id, message, requested_at, decided_at)
  values (t, auth.uid(), 'player', next_status, p_character, left(coalesce(p_message, ''), 300), now(),
          case when next_status = 'approved' then now() end)
  on conflict (table_id, user_id) do update
    set status = excluded.status, character_id = excluded.character_id, message = excluded.message,
        requested_at = now(), decided_at = excluded.decided_at;
  return next_status;
end $$;

create function public.join_public_table(p_table uuid, p_message text default '', p_character uuid default null)
returns public.member_status
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.tables where id = p_table and visibility = 'public') then
    raise exception 'Mesa não encontrada.';
  end if;
  return public._join_table(p_table, p_message, p_character);
end $$;

create function public.join_by_code(p_code text, p_message text default '', p_character uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from public.tables where invite_code = upper(trim(p_code));
  if t is null then raise exception 'Código de convite inválido.'; end if;
  perform public._join_table(t, p_message, p_character);
  return t;
end $$;

create function public.decide_member(p_table uuid, p_user uuid, p_status public.member_status)
returns void
language plpgsql security definer set search_path = public as $$
declare tbl public.tables;
begin
  select * into tbl from public.tables where id = p_table;
  if not found or tbl.owner_id <> auth.uid() then raise exception 'Apenas o mestre pode fazer isso.'; end if;
  if p_status not in ('approved', 'rejected', 'kicked') then raise exception 'Estado inválido.'; end if;
  if p_user = tbl.owner_id then raise exception 'O mestre não pode ser alterado.'; end if;
  if p_status = 'approved' and (
    select count(*) from public.table_members
    where table_id = p_table and role = 'player' and status = 'approved' and user_id <> p_user
  ) >= tbl.max_players then raise exception 'A mesa está cheia.'; end if;
  update public.table_members set status = p_status, decided_at = now()
  where table_id = p_table and user_id = p_user and role = 'player';
  if not found then raise exception 'Participante não encontrado.'; end if;
end $$;

create function public.leave_table(p_table uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.table_members set status = 'left', decided_at = now()
  where table_id = p_table and user_id = auth.uid() and role = 'player' and status in ('pending', 'approved');
end $$;

create function public.set_member_character(p_table uuid, p_character uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_character is not null and not exists (
    select 1 from public.characters where id = p_character and owner_id = auth.uid()
  ) then raise exception 'Ficha inválida.'; end if;
  update public.table_members set character_id = p_character
  where table_id = p_table and user_id = auth.uid() and status in ('pending', 'approved');
end $$;

create function public.rotate_invite(p_table uuid) returns text
language plpgsql security definer set search_path = public as $$
declare code text;
begin
  if not public.is_gm(p_table) then raise exception 'Apenas o mestre pode fazer isso.'; end if;
  code := upper(substr(md5(gen_random_uuid()::text), 1, 8));
  update public.tables set invite_code = code where id = p_table;
  return code;
end $$;

-- Listagem publica com contagem de jogadores e nome do mestre.
create function public.list_public_tables(p_search text default '')
returns table (
  id uuid, name text, description text, system text, status public.table_status,
  max_players int, gm_name text, player_count bigint, created_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.description, t.system, t.status, t.max_players,
         p.display_name,
         (select count(*) from public.table_members m
            where m.table_id = t.id and m.role = 'player' and m.status = 'approved'),
         t.created_at
  from public.tables t
  join public.profiles p on p.id = t.owner_id
  where auth.uid() is not null
    and t.visibility = 'public' and t.status <> 'closed'
    and (coalesce(trim(p_search), '') = ''
         or t.name ilike '%' || trim(p_search) || '%'
         or t.description ilike '%' || trim(p_search) || '%')
  order by t.created_at desc
  limit 100;
$$;

-- O codigo de convite nao e legivel por SELECT (grant so das demais colunas); o mestre o le via get_invite_code.
-- Jogadores recebem o codigo apenas via join_by_code, nunca por SELECT.
revoke select on public.tables from authenticated, anon;
grant select (id, owner_id, name, description, system, visibility, status, auto_approve, max_players, created_at)
  on public.tables to authenticated;
create function public.get_invite_code(p_table uuid) returns text
language sql stable security definer set search_path = public as $$
  select invite_code from public.tables where id = p_table and owner_id = auth.uid();
$$;

revoke all on function public._join_table(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.join_public_table(uuid, text, uuid) from public, anon;
revoke all on function public.join_by_code(text, text, uuid) from public, anon;
revoke all on function public.decide_member(uuid, uuid, public.member_status) from public, anon;
revoke all on function public.leave_table(uuid) from public, anon;
revoke all on function public.set_member_character(uuid, uuid) from public, anon;
revoke all on function public.rotate_invite(uuid) from public, anon;
revoke all on function public.list_public_tables(text) from public, anon;
revoke all on function public.get_invite_code(uuid) from public, anon;
