-- Aptidão: pontos já confirmados são PERMANENTES.
-- Troca só a função set_aptitude: a nova distribuição nunca pode ter menos pontos que a anterior em nenhum alvo
-- (só dá para acrescentar). Quem já rodou a 0026 roda só este arquivo. Pode rodar de novo sem estragar nada.

-- Jogador: confirma a distribuição dos pontos. Só o dono da ficha, só alvos que existem na ficha (atributos; perícias
-- treinadas) e nunca mais pontos do que recebeu. Pontos já confirmados são PERMANENTES: a nova distribuição nunca pode ter
-- menos pontos em nenhum alvo do que a anterior (só dá para acrescentar). Não mexe na XP já conquistada.
create or replace function public.set_aptitude(p_table uuid, p_character uuid, p_allocation jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  cdata jsonb; k text; v numeric; kind_x text; name_x text; clean jsonb := '{}'::jsonb; total int := 0; received int;
  cur public.character_aptitude; n int := 0;
begin
  if not public.owns_character(p_character) or not public.my_character_in(p_table, p_character) then raise exception 'Esta ficha não é sua nesta mesa.'; end if;
  if not public.table_accepts_messages(p_table) then raise exception 'Esta mesa está encerrada.'; end if;
  if p_allocation is null or jsonb_typeof(p_allocation) <> 'object' then raise exception 'Distribuição inválida.'; end if;
  select data into cdata from public.characters where id = p_character;
  insert into public.character_aptitude (table_id, character_id) values (p_table, p_character) on conflict do nothing;
  select * into cur from public.character_aptitude where table_id = p_table and character_id = p_character for update;
  for k in select jk from jsonb_object_keys(p_allocation) jk loop
    n := n + 1;
    if n > 200 then raise exception 'Distribuição inválida.'; end if;
    if jsonb_typeof(p_allocation -> k) <> 'number' then raise exception 'Valor inválido em %.', k; end if;
    v := (p_allocation ->> k)::numeric;
    if v <> trunc(v) or v < 0 or v > 1000 then raise exception 'Pontos inválidos em % (inteiro de 0 a 1000).', k; end if;
    if v = 0 then continue; end if;
    kind_x := split_part(k, ':', 1);
    name_x := substr(k, length(kind_x) + 2);
    if kind_x = 'attribute' then
      if (cdata -> 'attributes' ->> name_x) is null then raise exception 'O atributo % não existe na ficha.', name_x; end if;
    elsif kind_x = 'skill' then
      if coalesce((cdata -> 'skills' ->> name_x)::int, 0) <= 0 then raise exception 'A perícia % não existe na ficha.', name_x; end if;
    else
      raise exception 'Só atributos e perícias recebem Aptidão.';
    end if;
    clean := jsonb_set(clean, array[k], to_jsonb(v::int));
    total := total + v::int;
  end loop;
  -- Pontos já confirmados não podem ser removidos nem diminuídos.
  for k in select jk from jsonb_object_keys(cur.allocation) jk loop
    if coalesce((clean ->> k)::int, 0) < (cur.allocation ->> k)::int then
      raise exception 'Pontos de Aptidão já confirmados não podem ser removidos (%).', split_part(k, ':', 2);
    end if;
  end loop;
  received := public.aptitude_received(p_table, p_character);
  if total > received then raise exception 'Você distribuiu % pontos, mas só recebeu %.', total, received; end if;
  if cur.allocation is distinct from clean then
    update public.character_aptitude set allocation = clean, revision = revision + 1, updated_at = now() where table_id = p_table and character_id = p_character;
    insert into public.aptitude_log (table_id, character_id, before_alloc, after_alloc, points_received) values (p_table, p_character, cur.allocation, clean, received);
  end if;
  return jsonb_build_object('allocation', clean, 'received', received, 'distributed', total, 'available', received - total);
end $$;
revoke all on function public.set_aptitude(uuid, uuid, jsonb) from public, anon;
