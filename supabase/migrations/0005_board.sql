-- Fase 5: tabuleiro compartilhado (mapa, grade, tokens, marcadores) + Storage privado de mapas.

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null default 'Tabuleiro' check (char_length(name) between 1 and 100),
  map_path text check (map_path is null or char_length(map_path) <= 300),
  width int not null default 2000 check (width between 200 and 12000),
  height int not null default 1400 check (height between 200 and 12000),
  grid jsonb not null default '{"size":70,"visible":true}'::jsonb check (pg_column_size(grid) < 1024),
  settings jsonb not null default '{}'::jsonb check (pg_column_size(settings) < 4096),
  created_at timestamptz not null default now()
);
create index boards_table_idx on public.boards (table_id, created_at);

create table public.board_tokens (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  kind text not null default 'npc' check (kind in ('pc', 'npc', 'object')),
  name text not null default '' check (char_length(name) <= 60),
  character_id uuid references public.characters(id) on delete set null,
  x real not null default 100 check (x between -1000 and 13000),
  y real not null default 100 check (y between -1000 and 13000),
  size real not null default 1 check (size between 0.25 and 6),
  color text not null default '#7a4dff' check (color ~ '^#[0-9a-fA-F]{6}$'),
  hidden boolean not null default false,
  meta jsonb not null default '{}'::jsonb check (pg_column_size(meta) < 2048),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index board_tokens_board_idx on public.board_tokens (board_id);
create unique index board_tokens_pc_unique on public.board_tokens (board_id, character_id) where character_id is not null;

create table public.board_marks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  kind text not null default 'marker' check (kind in ('marker', 'note')),
  x real not null check (x between -1000 and 13000),
  y real not null check (y between -1000 and 13000),
  text text not null default '' check (char_length(text) <= 200),
  color text not null default '#d9a21b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index board_marks_board_idx on public.board_marks (board_id);

alter table public.boards enable row level security;
alter table public.board_tokens enable row level security;
alter table public.board_marks enable row level security;

-- Cada mesa ganha um tabuleiro padrao (inclui mesas ja existentes).
create function public.tables_make_board() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.boards (table_id) values (new.id);
  return new;
end $$;
create trigger tables_make_board after insert on public.tables
  for each row execute function public.tables_make_board();
insert into public.boards (table_id) select t.id from public.tables t
  where not exists (select 1 from public.boards b where b.table_id = t.id);

-- Boards: membros leem; so o mestre escreve.
create policy "boards_select" on public.boards for select to authenticated using (public.is_member(table_id));
create policy "boards_insert" on public.boards for insert to authenticated with check (public.is_gm(table_id));
create policy "boards_update" on public.boards for update to authenticated
  using (public.is_gm(table_id)) with check (public.is_gm(table_id));
create policy "boards_delete" on public.boards for delete to authenticated using (public.is_gm(table_id));

-- O token pode ser movido pelo mestre ou pelo dono da ficha vinculada.
create function public.can_move_token(t uuid, ch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_gm(t) or (ch is not null and exists (
    select 1 from public.table_members m
    where m.table_id = t and m.user_id = auth.uid() and m.status = 'approved' and m.character_id = ch));
$$;

create policy "tokens_select" on public.board_tokens for select to authenticated
  using (public.is_member(table_id) and (not hidden or public.is_gm(table_id)));
create policy "tokens_insert" on public.board_tokens for insert to authenticated
  with check (public.is_gm(table_id) and exists (select 1 from public.boards b where b.id = board_id and b.table_id = board_tokens.table_id));
create policy "tokens_update" on public.board_tokens for update to authenticated
  using (public.can_move_token(table_id, character_id))
  with check (public.can_move_token(table_id, character_id));
create policy "tokens_delete" on public.board_tokens for delete to authenticated using (public.is_gm(table_id));

-- Jogadores so alteram x/y; o mestre altera tudo (menos o vinculo com a mesa).
create function public.tokens_before_update() returns trigger
language plpgsql as $$
begin
  new.board_id := old.board_id;
  new.table_id := old.table_id;
  if not public.is_gm(old.table_id) then
    new.kind := old.kind; new.name := old.name; new.character_id := old.character_id;
    new.size := old.size; new.color := old.color; new.hidden := old.hidden; new.meta := old.meta;
  end if;
  return new;
end $$;
create trigger tokens_before_update before update on public.board_tokens
  for each row execute function public.tokens_before_update();

-- Marcadores: qualquer membro cria os seus; apaga os proprios ou o mestre apaga qualquer um. Notas so do mestre.
create policy "marks_select" on public.board_marks for select to authenticated using (public.is_member(table_id));
create policy "marks_insert" on public.board_marks for insert to authenticated
  with check (
    created_by = auth.uid() and public.is_member(table_id)
    and public.table_accepts_messages(table_id)
    and (kind = 'marker' or public.is_gm(table_id))
    and exists (select 1 from public.boards b where b.id = board_id and b.table_id = board_marks.table_id)
  );
create policy "marks_delete" on public.board_marks for delete to authenticated
  using (created_by = auth.uid() or public.is_gm(table_id));

-- Limite de marcadores por jogador e tabuleiro.
create function public.marks_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.board_marks where board_id = new.board_id and created_by = new.created_by) >= 30 then
    raise exception 'Limite de 30 marcadores por jogador. Apague alguns antes de criar novos.';
  end if;
  return new;
end $$;
create trigger marks_limit before insert on public.board_marks
  for each row execute function public.marks_limit();

alter publication supabase_realtime add table public.boards;
alter publication supabase_realtime add table public.board_tokens;
alter publication supabase_realtime add table public.board_marks;
-- DELETE precisa da linha antiga completa para filtrar por table_id.
alter table public.board_tokens replica identity full;
alter table public.board_marks replica identity full;

-- Storage privado para mapas: pasta = id da mesa. Membros leem, so o mestre grava.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('maps', 'maps', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

create function public.map_folder_table(name text) returns uuid
language plpgsql immutable as $$
begin
  return (storage.foldername(name))[1]::uuid;
exception when others then
  return null;
end $$;

create policy "maps_read" on storage.objects for select to authenticated
  using (bucket_id = 'maps' and public.is_member(public.map_folder_table(name)));
create policy "maps_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'maps' and public.is_gm(public.map_folder_table(name)));
create policy "maps_update" on storage.objects for update to authenticated
  using (bucket_id = 'maps' and public.is_gm(public.map_folder_table(name)))
  with check (bucket_id = 'maps' and public.is_gm(public.map_folder_table(name)));
create policy "maps_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'maps' and public.is_gm(public.map_folder_table(name)));
