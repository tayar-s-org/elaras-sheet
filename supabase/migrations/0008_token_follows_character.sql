-- Trocar a ficha na mesa leva o token junto: ele continua no mesmo lugar, agora com o nome e a imagem da ficha nova.
-- Se a ficha nova ja tem token no tabuleiro (ou o jogador ficou sem ficha), o token antigo e removido.

-- Troca de ficha pelo servidor pode alterar o vinculo do token (o gatilho normal impede jogadores de fazer isso).
create or replace function public.tokens_before_update() returns trigger
language plpgsql as $$
begin
  new.board_id := old.board_id;
  new.table_id := old.table_id;
  if not public.is_gm(old.table_id) and coalesce(current_setting('app.token_transfer', true), '') <> '1' then
    new.kind := old.kind; new.name := old.name; new.character_id := old.character_id;
    new.size := old.size; new.color := old.color; new.hidden := old.hidden; new.meta := old.meta;
  end if;
  return new;
end $$;

create or replace function public.set_member_character(p_table uuid, p_character uuid) returns void
language plpgsql security definer set search_path = public as $$
declare old_ch uuid;
begin
  if p_character is not null and not exists (
    select 1 from public.characters where id = p_character and owner_id = auth.uid()
  ) then raise exception 'Ficha inválida.'; end if;

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
