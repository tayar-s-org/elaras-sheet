-- Fase 5c: historico de alteracoes de vida, stamina e mana (preenchido por trigger; clientes so leem).

create table public.table_state_log (
  id bigint generated always as identity primary key,
  table_id uuid not null references public.tables(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  resource text not null check (resource in ('life', 'stamina', 'mana')),
  old_value int not null,
  new_value int not null,
  created_at timestamptz not null default now()
);
create index table_state_log_idx on public.table_state_log (table_id, id desc);
alter table public.table_state_log enable row level security;

create policy "state_log_select" on public.table_state_log for select to authenticated
  using (public.is_member(table_id));

-- Registra cada recurso que mudou. No primeiro registro (insert) o valor anterior vem de state.max, enviado pelo cliente.
create function public.state_log_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare k text; old_v int; new_v int;
begin
  foreach k in array array['life', 'stamina', 'mana'] loop
    new_v := nullif(new.state ->> k, '')::int;
    if tg_op = 'UPDATE' then
      old_v := coalesce(nullif(old.state ->> k, '')::int, nullif(new.state -> 'max' ->> k, '')::int);
    else
      old_v := nullif(new.state -> 'max' ->> k, '')::int;
    end if;
    if new_v is not null and old_v is not null and new_v <> old_v then
      insert into public.table_state_log (table_id, character_id, user_id, resource, old_value, new_value)
      values (new.table_id, new.character_id, auth.uid(), k, old_v, new_v);
    end if;
  end loop;
  return null;
exception when others then
  return null; -- o historico nunca deve impedir a alteracao em si
end $$;
create trigger state_log_changes after insert or update on public.table_character_state
  for each row execute function public.state_log_changes();

alter publication supabase_realtime add table public.table_state_log;
