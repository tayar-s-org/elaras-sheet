-- Fase 1: perfis e fichas pertencentes a usuarios, protegidos por RLS.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Aventureiro' check (char_length(display_name) between 1 and 60),
  avatar_path text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "profiles_select_authenticated" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), nullif(split_part(new.email, '@', 1), ''), 'Aventureiro'), 60)
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.characters (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  system text not null default 'sw',
  name text not null default '' check (char_length(name) <= 200),
  data jsonb not null check (pg_column_size(data) < 1048576),
  schema_version int not null default 1,
  revision int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index characters_owner_idx on public.characters (owner_id, updated_at desc);
alter table public.characters enable row level security;

create policy "characters_select_own" on public.characters
  for select to authenticated using (owner_id = auth.uid());
create policy "characters_insert_own" on public.characters
  for insert to authenticated with check (owner_id = auth.uid());
create policy "characters_update_own" on public.characters
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "characters_delete_own" on public.characters
  for delete to authenticated using (owner_id = auth.uid());

-- O servidor controla revision/updated_at/owner: o cliente nao pode forja-los.
create function public.characters_before_update() returns trigger
language plpgsql as $$
begin
  new.owner_id := old.owner_id;
  new.created_at := old.created_at;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end $$;

create trigger characters_before_update
  before update on public.characters
  for each row execute function public.characters_before_update();
