-- Fase 5b: imagens de token (criador de tokens). Bucket publico de arquivos minusculos com nome aleatorio.

alter table public.board_tokens
  add column image_path text check (image_path is null or char_length(image_path) <= 300);

-- Bucket 'tokens': pasta = id do usuario dono da imagem. Leitura publica (URL com uuid impossivel de adivinhar);
-- so o dono grava, troca e apaga os proprios arquivos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tokens', 'tokens', true, 1048576, array['image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 1048576,
  allowed_mime_types = array['image/png', 'image/webp'];

create policy "tokens_img_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'tokens' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "tokens_img_update" on storage.objects for update to authenticated
  using (bucket_id = 'tokens' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'tokens' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "tokens_img_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'tokens' and (storage.foldername(name))[1] = auth.uid()::text);

-- Jogadores agora podem colocar o proprio token (personagem vinculado a eles) no tabuleiro.
drop policy "tokens_insert" on public.board_tokens;
create policy "tokens_insert" on public.board_tokens for insert to authenticated
  with check (
    exists (select 1 from public.boards b where b.id = board_id and b.table_id = board_tokens.table_id)
    and (public.is_gm(table_id)
      or (kind = 'pc' and character_id is not null and public.can_move_token(table_id, character_id)
          and public.table_accepts_messages(table_id)))
  );

-- Jogador so define posicao/imagem do proprio token; tamanho, cor e visibilidade ficam padrao ate o mestre mudar.
create function public.tokens_before_insert() returns trigger
language plpgsql as $$
begin
  if not public.is_gm(new.table_id) then
    new.kind := 'pc'; new.size := 1; new.hidden := false; new.meta := '{}'::jsonb;
  end if;
  return new;
end $$;
create trigger tokens_before_insert before insert on public.board_tokens
  for each row execute function public.tokens_before_insert();

-- Atualizacao: image_path passa a ser editavel tambem pelo dono do personagem (a RLS ja limita a quem move o token).
-- (A funcao tokens_before_update original nao menciona image_path, entao nada a redefinir.)
