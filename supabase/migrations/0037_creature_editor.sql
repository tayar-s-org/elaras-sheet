-- Fichas rápidas e originais editáveis não fazem parte do Realtime público.
alter table public.creature_presets
  add column if not exists details jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.creature_presets add constraint creature_presets_details_check
    check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 24000);
exception when duplicate_object then null;
end $$;

create table if not exists public.creature_token_details (
  token_id uuid primary key references public.board_tokens(id) on delete cascade,
  details jsonb not null check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 24000)
);
alter table public.creature_token_details enable row level security;
revoke all on public.creature_token_details from anon, authenticated;
grant select, insert, update on public.creature_token_details to authenticated;

drop policy if exists creature_details_gm on public.creature_token_details;
create policy creature_details_gm on public.creature_token_details for all to authenticated
  using (exists (select 1 from public.board_tokens t where t.id = token_id and t.kind = 'npc' and public.is_gm(t.table_id)))
  with check (exists (select 1 from public.board_tokens t where t.id = token_id and t.kind = 'npc' and public.is_gm(t.table_id)));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('token-sources', 'token-sources', false, 8388608, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do nothing;

drop policy if exists token_sources_read_own on storage.objects;
create policy token_sources_read_own on storage.objects for select to authenticated
  using (bucket_id = 'token-sources' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists token_sources_insert_own on storage.objects;
create policy token_sources_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'token-sources' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.save_creature_token(p_board uuid, p_token uuid, p_data jsonb, p_details jsonb)
returns setof public.board_tokens language plpgsql security invoker set search_path = public as $$
declare
  v_table uuid;
  v_row public.board_tokens;
begin
  select table_id into v_table from public.boards where id = p_board;
  if v_table is null or not public.is_gm(v_table) then raise exception 'Apenas o mestre pode salvar criaturas.'; end if;

  if p_token is null then
    insert into public.board_tokens (board_id, table_id, kind, name, image_path, size, x, y, color, meta, name_hidden)
    values (p_board, v_table, 'npc', p_data->>'name', p_data->>'image_path', (p_data->>'size')::real,
      (p_data->>'x')::real, (p_data->>'y')::real, p_data->>'color', p_data->'meta', coalesce((p_data->>'name_hidden')::boolean, false))
    returning * into v_row;
  else
    update public.board_tokens set name = p_data->>'name', image_path = p_data->>'image_path',
      size = (p_data->>'size')::real, x = coalesce((p_data->>'x')::real, x), y = coalesce((p_data->>'y')::real, y),
      meta = case when p_data->'meta' ? 'maxHp' and meta ? 'hp' then
        jsonb_set(p_data->'meta', '{hp}', to_jsonb(least((meta->>'hp')::int, (p_data->'meta'->>'maxHp')::int)))
        else p_data->'meta' end,
      name_hidden = coalesce((p_data->>'name_hidden')::boolean, false)
    where id = p_token and board_id = p_board and kind = 'npc'
    returning * into v_row;
    if not found then raise exception 'Criatura não encontrada.'; end if;
  end if;

  insert into public.creature_token_details (token_id, details) values (v_row.id, coalesce(p_details, '{}'::jsonb))
  on conflict (token_id) do update set details = excluded.details;
  return next v_row;
end $$;

revoke execute on function public.save_creature_token(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_creature_token(uuid, uuid, jsonb, jsonb) to authenticated;
