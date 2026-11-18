-- Modulo do mestre: musica da mesa e predefinicoes de criaturas.
--
-- Musica: o arquivo (MP4/M4A/MP3) vai para o bucket privado 'music' (pasta = id da mesa; membros leem por link
-- temporario, so o mestre grava). O estado de reproducao (qual musica, tocando, posicao) fica em boards.settings.music,
-- que ja chega a todos pelo tempo real do tabuleiro.
--
-- Predefinicoes: criaturas salvas pelo mestre, por mesa (creature_presets). Sem tempo real: so o mestre le.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('music', 'music', false, 31457280, array['video/mp4', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg'])
on conflict (id) do update set public = false, file_size_limit = 31457280,
  allowed_mime_types = array['video/mp4', 'audio/mp4', 'audio/x-m4a', 'audio/mpeg'];

create policy "music_read" on storage.objects for select to authenticated
  using (bucket_id = 'music' and public.is_member(public.map_folder_table(name)));
create policy "music_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'music' and public.is_gm(public.map_folder_table(name)));
create policy "music_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'music' and public.is_gm(public.map_folder_table(name)));

create table public.creature_presets (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  image_path text check (image_path is null or char_length(image_path) <= 300),
  max_hp int not null check (max_hp between 1 and 9999),
  size real not null default 1 check (size between 0.25 and 6),
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index creature_presets_table_idx on public.creature_presets (table_id, created_at);
alter table public.creature_presets enable row level security;

create policy "presets_select" on public.creature_presets for select to authenticated using (public.is_gm(table_id));
create policy "presets_insert" on public.creature_presets for insert to authenticated with check (public.is_gm(table_id));
create policy "presets_update" on public.creature_presets for update to authenticated
  using (public.is_gm(table_id)) with check (public.is_gm(table_id));
create policy "presets_delete" on public.creature_presets for delete to authenticated using (public.is_gm(table_id));

-- A mesa e o dono do preset nao mudam; no maximo 100 predefinicoes por mesa.
create function public.presets_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.table_id := old.table_id;
    return new;
  end if;
  if (select count(*) from public.creature_presets where table_id = new.table_id) >= 100 then
    raise exception 'Limite de 100 predefinições por mesa. Apague algumas antes de salvar novas.';
  end if;
  return new;
end $$;
create trigger presets_guard before insert or update on public.creature_presets
  for each row execute function public.presets_guard();
