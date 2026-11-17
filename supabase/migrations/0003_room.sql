-- Fase 3: sala de jogo (chat, estado por mesa, leitura de fichas pelos membros, Realtime privado).

-- Funcoes auxiliares.
create function public.table_accepts_messages(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tables where id = t and status <> 'closed');
$$;

create function public.is_member_of(t uuid, u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.table_members where table_id = t and user_id = u and status = 'approved');
$$;

-- Fichas vinculadas a mesas onde o usuario e membro aprovado podem ser lidas por ele.
create function public.character_visible_in_my_tables(ch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.table_members m
    where m.character_id = ch and m.status = 'approved'
      and exists (select 1 from public.table_members me
                  where me.table_id = m.table_id and me.user_id = auth.uid() and me.status = 'approved')
  );
$$;
create policy "characters_select_table_members" on public.characters
  for select to authenticated using (public.character_visible_in_my_tables(id));

-- Mensagens.
create table public.table_messages (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.tables(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  kind text not null default 'chat' check (kind in ('chat', 'whisper')),
  to_user uuid references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  check ((kind = 'chat' and to_user is null) or (kind = 'whisper' and to_user is not null))
);
create index table_messages_table_idx on public.table_messages (table_id, id desc);
alter table public.table_messages enable row level security;

create policy "messages_select" on public.table_messages for select to authenticated
  using (
    public.is_member(table_id)
    and (kind = 'chat' or user_id = auth.uid() or to_user = auth.uid() or public.is_gm(table_id))
  );
create policy "messages_insert" on public.table_messages for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_member(table_id)
    and public.table_accepts_messages(table_id)
    and (to_user is null or public.is_member_of(table_id, to_user))
  );

-- Limite simples de ritmo: no maximo 20 mensagens a cada 10 segundos por usuario e mesa.
create function public.table_messages_rate_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.table_messages
      where table_id = new.table_id and user_id = new.user_id and created_at > now() - interval '10 seconds') >= 20 then
    raise exception 'Você está enviando mensagens rápido demais.';
  end if;
  return new;
end $$;
create trigger table_messages_rate_limit before insert on public.table_messages
  for each row execute function public.table_messages_rate_limit();

-- Estado de jogo por mesa e ficha (vida, stamina, mana atuais...). A ficha da biblioteca fica intacta.
create table public.table_character_state (
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  state jsonb not null default '{}'::jsonb check (pg_column_size(state) < 16384),
  updated_by uuid default auth.uid() references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (table_id, character_id)
);
alter table public.table_character_state enable row level security;

create function public.can_edit_state(t uuid, ch uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.table_members m
    where m.table_id = t and m.character_id = ch and m.status = 'approved'
      and (m.user_id = auth.uid() or public.is_gm(t))
  );
$$;

create policy "state_select" on public.table_character_state for select to authenticated
  using (public.is_member(table_id));
create policy "state_insert" on public.table_character_state for insert to authenticated
  with check (public.can_edit_state(table_id, character_id) and public.table_accepts_messages(table_id));
create policy "state_update" on public.table_character_state for update to authenticated
  using (public.can_edit_state(table_id, character_id))
  with check (public.can_edit_state(table_id, character_id) and public.table_accepts_messages(table_id));

create function public.state_touch() returns trigger
language plpgsql as $$
begin
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;
create trigger state_touch before insert or update on public.table_character_state
  for each row execute function public.state_touch();

-- Realtime: mudancas de tabela (filtradas por RLS) e canais privados table:{id} para Presence/Broadcast.
alter publication supabase_realtime add table public.table_messages;
alter publication supabase_realtime add table public.table_character_state;
alter publication supabase_realtime add table public.table_members;

create policy "room_realtime_read" on realtime.messages for select to authenticated
  using (exists (
    select 1 from public.table_members m
    where m.user_id = auth.uid() and m.status = 'approved'
      and realtime.topic() = 'table:' || m.table_id::text
  ));
create policy "room_realtime_write" on realtime.messages for insert to authenticated
  with check (exists (
    select 1 from public.table_members m
    where m.user_id = auth.uid() and m.status = 'approved'
      and realtime.topic() = 'table:' || m.table_id::text
  ));
