-- Ficha vinculada a uma mesa: a ficha e criada para uma mesa e nao pode ser usada em outra.
-- Fichas antigas (sem mesa) continuam validas: ficam presas a mesa em que forem usadas pela primeira vez.

alter table public.characters
  add column table_id uuid references public.tables(id) on delete set null;
create index characters_table_idx on public.characters (table_id) where table_id is not null;

-- Criar uma ficha para uma mesa exige participar dela.
drop policy "characters_insert_own" on public.characters;
create policy "characters_insert_own" on public.characters for insert to authenticated
  with check (owner_id = auth.uid() and (table_id is null or public.is_member(table_id)));

-- A mesa de uma ficha nao muda: so se liga uma vez (sem mesa -> mesa em que o dono participa) ou volta a "sem mesa" se a mesa for apagada.
create function public.characters_table_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.table_id is distinct from old.table_id then
    if old.table_id is not null then
      if exists (select 1 from public.tables where id = old.table_id) then new.table_id := old.table_id; end if;
    elsif new.table_id is not null
      and coalesce(current_setting('app.bind_character', true), '') <> '1'
      and not public.is_member(new.table_id) then
      new.table_id := null;
    end if;
  end if;
  return new;
end $$;
create trigger characters_table_guard before update on public.characters
  for each row execute function public.characters_table_guard();

-- Liga uma ficha antiga (sem mesa) a uma mesa em que o dono participa.
create function public.bind_character_table(p_character uuid, p_table uuid) returns void
language plpgsql security definer set search_path = public as $$
declare current_table uuid;
begin
  select table_id into current_table from public.characters where id = p_character and owner_id = auth.uid();
  if not found then raise exception 'Ficha inválida.'; end if;
  if current_table is not null and current_table <> p_table then raise exception 'Esta ficha já pertence a outra mesa.'; end if;
  if not exists (select 1 from public.table_members where table_id = p_table and user_id = auth.uid() and status in ('pending', 'approved')) then
    raise exception 'Você não participa desta mesa.';
  end if;
  perform set_config('app.bind_character', '1', true);
  update public.characters set table_id = p_table where id = p_character;
  perform set_config('app.bind_character', '', true);
end $$;
revoke all on function public.bind_character_table(uuid, uuid) from public, anon;

-- Trocar a ficha na mesa: so vale uma ficha dessa mesa (ou sem mesa, que passa a ser dela). Mantem o token acompanhando a troca.
create or replace function public.set_member_character(p_table uuid, p_character uuid) returns void
language plpgsql security definer set search_path = public as $$
declare old_ch uuid; ch_table uuid;
begin
  if p_character is not null then
    select table_id into ch_table from public.characters where id = p_character and owner_id = auth.uid();
    if not found then raise exception 'Ficha inválida.'; end if;
    if ch_table is not null and ch_table <> p_table then
      raise exception 'Esta ficha foi criada para outra mesa e não pode ser usada nesta.';
    end if;
    if ch_table is null then
      if not exists (select 1 from public.table_members where table_id = p_table and user_id = auth.uid() and status in ('pending', 'approved')) then
        raise exception 'Você não participa desta mesa.';
      end if;
      perform set_config('app.bind_character', '1', true);
      update public.characters set table_id = p_table where id = p_character;
      perform set_config('app.bind_character', '', true);
    end if;
  end if;

  select character_id into old_ch from public.table_members
  where table_id = p_table and user_id = auth.uid() and status in ('pending', 'approved');

  update public.table_members set character_id = p_character
  where table_id = p_table and user_id = auth.uid() and status in ('pending', 'approved');

  if old_ch is not null and old_ch is distinct from p_character then
    if p_character is not null and not exists (
      select 1 from public.board_tokens where table_id = p_table and character_id = p_character
    ) then
      perform set_config('app.token_transfer', '1', true);
      update public.board_tokens
        set character_id = p_character, image_path = null,
            name = left(coalesce((select c.name from public.characters c where c.id = p_character), ''), 60)
        where table_id = p_table and character_id = old_ch;
      perform set_config('app.token_transfer', '', true);
    else
      delete from public.board_tokens where table_id = p_table and character_id = old_ch;
    end if;
  end if;
end $$;

-- Pedir para entrar ja com uma ficha: ela precisa ser da mesa (ou sem mesa, que passa a ser dela).
create or replace function public._join_table(t uuid, p_message text, p_character uuid) returns public.member_status
language plpgsql security definer set search_path = public as $$
declare
  tbl public.tables;
  cur public.table_members;
  next_status public.member_status;
  ch_table uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  select * into tbl from public.tables where id = t;
  if not found then raise exception 'Mesa não encontrada.'; end if;
  if tbl.status = 'closed' then raise exception 'Esta mesa está encerrada.'; end if;
  if p_character is not null then
    select table_id into ch_table from public.characters where id = p_character and owner_id = auth.uid();
    if not found then raise exception 'Ficha inválida.'; end if;
    if ch_table is not null and ch_table <> t then
      raise exception 'Esta ficha foi criada para outra mesa e não pode ser usada nesta.';
    end if;
  end if;

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

  if p_character is not null and ch_table is null then
    perform set_config('app.bind_character', '1', true);
    update public.characters set table_id = t where id = p_character;
    perform set_config('app.bind_character', '', true);
  end if;
  return next_status;
end $$;
