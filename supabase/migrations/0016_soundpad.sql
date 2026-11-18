-- Soundpad da mesa: efeitos sonoros curtos que o mestre sobe e toca para todos.
-- Os arquivos ficam no bucket privado 'music' (pasta = id da mesa, politicas da 0015); aqui fica so a lista.
-- A reproducao e avisada aos jogadores por broadcast no canal da sala (nao grava nada).

create table public.table_sounds (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  path text not null check (char_length(path) <= 300),
  loop boolean not null default false,
  created_at timestamptz not null default now()
);
create index table_sounds_table_idx on public.table_sounds (table_id, created_at);
alter table public.table_sounds enable row level security;

create policy "sounds_select" on public.table_sounds for select to authenticated using (public.is_member(table_id));
create policy "sounds_insert" on public.table_sounds for insert to authenticated with check (public.is_gm(table_id));
create policy "sounds_update" on public.table_sounds for update to authenticated
  using (public.is_gm(table_id)) with check (public.is_gm(table_id));
create policy "sounds_delete" on public.table_sounds for delete to authenticated using (public.is_gm(table_id));

-- A mesa nao muda e o caminho precisa estar na pasta da propria mesa; no maximo 30 sons por mesa.
create function public.sounds_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.table_id := old.table_id;
    new.path := old.path;
    return new;
  end if;
  if public.map_folder_table(new.path) is distinct from new.table_id then
    raise exception 'Arquivo fora da pasta da mesa.';
  end if;
  if (select count(*) from public.table_sounds where table_id = new.table_id) >= 30 then
    raise exception 'Limite de 30 sons por mesa. Apague alguns antes de enviar novos.';
  end if;
  return new;
end $$;
create trigger sounds_guard before insert or update on public.table_sounds
  for each row execute function public.sounds_guard();
