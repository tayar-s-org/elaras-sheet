-- 0046: condições do mestre à prova de sobrescrita (revisão modular, achados 20 e 26).
--
--  * Achado 26: table_character_state.state aceitava qualquer JSON. Um jogador podia gravar `[]` (o gatilho state_keep_conditions
--    deixava passar o que não é objeto) e depois `{}`, apagando as condições que o mestre aplicou. Agora o estado SEMPRE é um objeto
--    (restrição + gatilho que recusa o resto), então toda escrita que não seja do mestre preserva state.conditions.
--  * Achado 20: gm_set_conditions troca a lista inteira a partir do que a tela viu; duas abas (ou dois cliques rápidos) apagavam
--    a condição uma da outra. gm_conditions_delta aplica só a diferença (acrescentar / remover por id) sobre a lista que está no banco,
--    com a linha travada, e grava no histórico do mestre pelo mesmo caminho de gm_set_conditions.
--
-- Não apaga dados do jogo: só normaliza para '{}' linhas cujo estado não era objeto (lixo que o app nunca grava). Pode ser repetida.

-- ---------- estado sempre objeto ----------
update public.table_character_state set state = '{}'::jsonb where jsonb_typeof(state) is distinct from 'object';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'table_character_state_state_is_object' and conrelid = 'public.table_character_state'::regclass) then
    alter table public.table_character_state
      add constraint table_character_state_state_is_object check (jsonb_typeof(state) = 'object') not valid;
  end if;
end $$;
-- As linhas antigas já foram normalizadas acima; validar só confere (trava leve, não bloqueia leituras nem escritas).
alter table public.table_character_state validate constraint table_character_state_state_is_object;

-- Mesma função da 0040, agora sem a brecha: estado que não é objeto é recusado, em vez de passar sem preservar as condições.
create or replace function public.state_keep_conditions() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('elara.mh', true), '') = '1' then return new; end if;
  if jsonb_typeof(new.state) is distinct from 'object' then raise exception 'O estado do personagem precisa ser um objeto JSON.'; end if;
  if tg_op = 'INSERT' then
    new.state := new.state - 'conditions';
  elsif jsonb_typeof(old.state) = 'object' and old.state ? 'conditions' then
    new.state := jsonb_set(new.state, '{conditions}', old.state -> 'conditions');
  else
    new.state := new.state - 'conditions';
  end if;
  return new;
end $$;

-- ---------- RPC: condições por diferença ----------
-- p_add: condições novas (mesmo formato de gm_set_conditions; rótulo repetido é ignorado, máximo 8 no total).
-- p_remove: ids das condições a tirar. A lista base é a do banco, lida com a linha travada.
create or replace function public.gm_conditions_delta(p_table uuid, p_character uuid, p_add jsonb default '[]'::jsonb,
  p_remove text[] default '{}', p_note text default '', p_request_id uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare rep jsonb; st jsonb; old_c jsonb; new_c jsonb;
begin
  rep := public.mh_begin(p_table, p_character, p_request_id, 'condition');
  if rep is not null then return rep; end if;
  insert into public.table_character_state (table_id, character_id, state) values (p_table, p_character, '{}'::jsonb)
    on conflict (table_id, character_id) do nothing;
  select state into st from public.table_character_state where table_id = p_table and character_id = p_character for update;
  old_c := coalesce(st -> 'conditions', '[]'::jsonb);
  new_c := public.mh_clean_conditions(
    coalesce((select jsonb_agg(c order by ord) from jsonb_array_elements(old_c) with ordinality as t(c, ord)
      where coalesce(c ->> 'id', '') <> all (coalesce(p_remove, '{}'))), '[]'::jsonb)
    || public.mh_clean_conditions(p_add));
  if new_c = old_c then
    return jsonb_build_object('ok', true, 'replayed', true, 'category', 'condition', 'kind', 'update', 'summary', 'Sem alterações nas condições',
      'before', jsonb_build_object('conditions', old_c), 'after', jsonb_build_object('conditions', old_c));
  end if;
  -- A trava da linha continua valendo até o fim da transação; gm_set_conditions regrava e registra no histórico como sempre.
  return public.gm_set_conditions(p_table, p_character, new_c, p_note, p_request_id);
end $$;

revoke all on function public.gm_conditions_delta(uuid, uuid, jsonb, text[], text, uuid) from public, anon;
grant execute on function public.gm_conditions_delta(uuid, uuid, jsonb, text[], text, uuid) to authenticated;
