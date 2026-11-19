create table if not exists public.saved_board_maps (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  image_path text not null unique check (split_part(image_path,'/',1) = table_id::text),
  width int not null check (width between 200 and 12000),
  height int not null check (height between 200 and 12000),
  grid jsonb not null check (jsonb_typeof(grid) = 'object' and pg_column_size(grid) < 1024),
  created_at timestamptz not null default now()
);
create index if not exists saved_board_maps_table on public.saved_board_maps(table_id,created_at);
alter table public.saved_board_maps enable row level security;
revoke all on public.saved_board_maps from anon, authenticated;
grant select, insert, update, delete on public.saved_board_maps to authenticated;
drop policy if exists saved_board_maps_gm on public.saved_board_maps;
create policy saved_board_maps_gm on public.saved_board_maps for all to authenticated
  using (public.is_gm(table_id)) with check (public.is_gm(table_id));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('map-library','map-library',false,5242880,array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
drop policy if exists map_library_gm on storage.objects;
create policy map_library_gm on storage.objects for all to authenticated
  using (bucket_id = 'map-library' and public.is_gm(public.map_folder_table(name)))
  with check (bucket_id = 'map-library' and public.is_gm(public.map_folder_table(name)));

create or replace function public.switch_board_map(
  p_board uuid, p_previous text, p_path text, p_width int, p_height int, p_grid jsonb, p_clear_marks boolean
) returns setof public.boards language plpgsql security invoker set search_path = public as $$
declare
  v_board public.boards;
begin
  select * into v_board from public.boards where id=p_board for update;
  if not found or not public.is_gm(v_board.table_id) then
    raise exception 'Apenas o mestre pode trocar o mapa.';
  end if;
  if v_board.map_path is distinct from p_previous then
    raise exception 'O mapa foi alterado. Atualize o tabuleiro e tente novamente.';
  end if;
  if p_path is not null and public.map_folder_table(p_path) is distinct from v_board.table_id then
    raise exception 'A imagem precisa pertencer a esta mesa.';
  end if;
  if p_clear_marks then
    delete from public.board_marks where board_id=p_board;
  elsif exists(select 1 from public.board_marks where board_id=p_board) then
    raise exception 'Confirme a troca do mapa com a limpeza dos marcadores.';
  end if;
  update public.board_tokens set
    x = round(greatest(0,least(p_width,case when x < 0 or x > v_board.width or y < 0 or y > v_board.height then p_width/2.0 else x*p_width/v_board.width end))),
    y = round(greatest(0,least(p_height,case when x < 0 or x > v_board.width or y < 0 or y > v_board.height then p_height/2.0 else y*p_height/v_board.height end)))
  where board_id=p_board and (p_width<>v_board.width or p_height<>v_board.height);
  update public.boards set map_path=p_path, width=p_width, height=p_height, grid=coalesce(p_grid,grid)
    where id=p_board returning * into v_board;
  return next v_board;
end $$;
revoke execute on function public.switch_board_map(uuid,text,text,int,int,jsonb,boolean) from public,anon;
grant execute on function public.switch_board_map(uuid,text,text,int,int,jsonb,boolean) to authenticated;
