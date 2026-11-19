-- 0034: criaturas com nome oculto e efeitos no token.
--
-- * name_hidden: o mestre oculta o nome da criatura. Enquanto oculto, a linha do token que os jogadores leem fica com
--   name = '' e image_path = null (a interface mostra "?"). O nome e a imagem REAIS ficam em board_token_secrets,
--   que só o mestre da mesa consegue ler: nada disso chega ao navegador dos jogadores (nem pelo Realtime).
--   Um gatilho faz a troca sozinho; o app só liga/desliga name_hidden.
-- * effects: lista pública de efeitos (envenenada, atordoada…) no formato [{ "id", "label", "icon" }].
--
-- Só o mestre altera name_hidden e effects (jogadores continuam alterando só x/y do próprio token).
-- Aditiva e pode ser repetida. Não mexe em tokens_before_insert/update.

alter table public.board_tokens add column if not exists name_hidden boolean not null default false;
alter table public.board_tokens add column if not exists effects jsonb not null default '[]'::jsonb;

do $$ begin
  alter table public.board_tokens add constraint board_tokens_effects_check
    check (jsonb_typeof(effects) = 'array' and pg_column_size(effects) < 2048);
exception when duplicate_object then null;
end $$;

-- Valores reais (nome e imagem) dos tokens com nome oculto. Sem políticas de escrita: só o gatilho (security definer) grava.
create table if not exists public.board_token_secrets (
  token_id uuid primary key references public.board_tokens(id) on delete cascade deferrable initially deferred,
  board_id uuid not null references public.boards(id) on delete cascade,
  table_id uuid not null references public.tables(id) on delete cascade,
  name text not null default '' check (char_length(name) <= 60),
  image_path text check (image_path is null or char_length(image_path) <= 300)
);
create index if not exists board_token_secrets_board_idx on public.board_token_secrets (board_id);

alter table public.board_token_secrets enable row level security;
revoke all on public.board_token_secrets from anon, authenticated;
grant select on public.board_token_secrets to authenticated;
drop policy if exists "token_secrets_select" on public.board_token_secrets;
create policy "token_secrets_select" on public.board_token_secrets for select to authenticated
  using (public.is_gm(table_id));

-- Antes de gravar o token: aplica a regra do nome oculto e impede jogadores de mexer em name_hidden/effects.
-- (O nome do gatilho vem depois de tokens_before_insert/update, que rodam primeiro, em ordem alfabética.)
create or replace function public.tokens_hidden_name() returns trigger
language plpgsql security definer set search_path = public as $$
declare sec public.board_token_secrets;
begin
  if not public.is_gm(new.table_id) then
    if tg_op = 'INSERT' then
      new.name_hidden := false; new.effects := '[]'::jsonb;
    else
      new.name_hidden := old.name_hidden; new.effects := old.effects;
    end if;
    return new;
  end if;

  if new.kind = 'pc' then new.name_hidden := false; end if;   -- só criaturas e objetos podem ter o nome oculto
  select * into sec from public.board_token_secrets where token_id = new.id;

  if new.name_hidden then
    -- Valores reais: os que chegaram agora (nome/imagem novos) ou, se vieram em branco, os já guardados.
    if tg_op = 'INSERT' or not coalesce(old.name_hidden, false) or new.name <> '' or new.image_path is not null then
      insert into public.board_token_secrets (token_id, board_id, table_id, name, image_path)
      values (new.id, new.board_id, new.table_id,
        coalesce(nullif(new.name, ''), sec.name, ''), coalesce(new.image_path, sec.image_path))
      on conflict (token_id) do update set name = excluded.name, image_path = excluded.image_path;
    end if;
    new.name := '';
    new.image_path := null;
  elsif tg_op = 'UPDATE' and old.name_hidden then
    -- Desocultar: o nome e a imagem reais voltam para a linha do token.
    if sec.token_id is not null then
      if new.name = '' then new.name := sec.name; end if;
      if new.image_path is null then new.image_path := sec.image_path; end if;
    end if;
    delete from public.board_token_secrets where token_id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists tokens_hidden_name on public.board_tokens;
create trigger tokens_hidden_name before insert or update on public.board_tokens
  for each row execute function public.tokens_hidden_name();
