-- 0049: o painel do grupo passa a gravar UM recurso por vez (vida, stamina ou mana) ou só o desmaio, sob trava da linha.
--
-- Antes o cliente reescrevia o estado inteiro (upsert) a partir da cópia local: duas pessoas (jogador e mestre) mexendo em
-- recursos diferentes se sobrescreviam. Agora o servidor lê o estado atual com `for update`, troca só o campo pedido e
-- devolve o estado resultante, para o cliente reconciliar.
-- Quem pode escrever é o mesmo de hoje (política state_update): o dono da ficha aprovada ou o mestre, em mesa que aceita alterações.
-- A condição que o mestre aplica (state.conditions) continua protegida pelo gatilho state_keep_conditions.
-- Só cria funções (create or replace); pode ser repetida.

-- Mesma regra de src/incapacitation.js: 0 acima da metade, 1 na metade ou menos, 2 abaixo de 25%.
create or replace function public.state_resource_level(cur numeric, mx numeric) returns int
language sql immutable as $$
  select case when not (mx > 0) then 0 when cur < mx * 0.25 then 2 when cur <= mx / 2 then 1 else 0 end;
$$;

-- Valida e normaliza os máximos enviados pela ficha ({life, stamina, mana}, inteiros de 0 a 100000).
create or replace function public.state_clean_max(p_max jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare k text; clean jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_max) is distinct from 'object' then raise exception 'Máximos inválidos.'; end if;
  foreach k in array array['life', 'stamina', 'mana'] loop
    if jsonb_typeof(p_max -> k) is distinct from 'number' or (p_max ->> k)::numeric not between 0 and 100000 then
      raise exception 'Máximos inválidos.';
    end if;
    clean := clean || jsonb_build_object(k, round((p_max ->> k)::numeric)::int);
  end loop;
  return clean;
end $$;

-- Confere quem pode editar, cria a linha vazia se ainda não existe e a trava até o fim da transação. Devolve o estado atual.
create or replace function public.state_lock_for_edit(p_table uuid, p_character uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st jsonb;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if not public.can_edit_state(p_table, p_character) then raise exception 'Você não pode alterar esta ficha.'; end if;
  if not public.table_accepts_messages(p_table) then raise exception 'Esta mesa está encerrada.'; end if;
  insert into public.table_character_state (table_id, character_id, state) values (p_table, p_character, '{}'::jsonb)
    on conflict (table_id, character_id) do nothing;
  select state into st from public.table_character_state where table_id = p_table and character_id = p_character for update;
  return st;
end $$;

-- Estado com os três recursos preenchidos (o que falta fica no máximo) e os máximos atuais. O histórico (0007) compara com isto.
create or replace function public.state_filled(st jsonb, mx jsonb) returns jsonb
language sql immutable as $$
  select jsonb_build_object('life', mx -> 'life', 'stamina', mx -> 'stamina', 'mana', mx -> 'mana') || st || jsonb_build_object('max', mx);
$$;

-- Total de incapacitação (Vida + Stamina), como em src/incapacitation.js.
create or replace function public.state_incap_total(st jsonb, mx jsonb) returns int
language sql immutable as $$
  select public.state_resource_level(least((mx ->> 'life')::numeric, greatest(0, coalesce(nullif(st ->> 'life', '')::numeric, (mx ->> 'life')::numeric))), (mx ->> 'life')::numeric)
       + public.state_resource_level(least((mx ->> 'stamina')::numeric, greatest(0, coalesce(nullif(st ->> 'stamina', '')::numeric, (mx ->> 'stamina')::numeric))), (mx ->> 'stamina')::numeric);
$$;

-- Altera um recurso. O prazo/desmaio do mestre só continua se a ficha ainda estiver na Incapacitação 4.
create or replace function public.set_state_resource(p_table uuid, p_character uuid, p_resource text, p_value int, p_max jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mx jsonb; st jsonb;
begin
  if p_resource not in ('life', 'stamina', 'mana') then raise exception 'Recurso inválido.'; end if;
  mx := public.state_clean_max(p_max);
  if p_value is null or p_value < 0 or p_value > (mx ->> p_resource)::int then raise exception 'Valor fora dos limites.'; end if;
  st := public.state_filled(public.state_lock_for_edit(p_table, p_character), mx) || jsonb_build_object(p_resource, p_value);
  if st ? 'faint' and public.state_incap_total(st, mx) <> 4 then st := st - 'faint'; end if;
  update public.table_character_state set state = st where table_id = p_table and character_id = p_character returning state into st;
  return st;
end $$;

-- Define o prazo para desmaiar ({hours, fainted}); mexe só nesse campo (e nos máximos, como antes).
create or replace function public.set_state_faint(p_table uuid, p_character uuid, p_faint jsonb, p_max jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare mx jsonb; st jsonb;
begin
  if jsonb_typeof(p_faint) is distinct from 'object' or jsonb_typeof(p_faint -> 'fainted') is distinct from 'boolean'
     or coalesce(jsonb_typeof(p_faint -> 'hours'), 'null') not in ('number', 'null')
     or coalesce((p_faint ->> 'hours')::numeric, 1) not between 1 and 999 then
    raise exception 'Prazo de desmaio inválido.';
  end if;
  mx := public.state_clean_max(p_max);
  st := public.state_filled(public.state_lock_for_edit(p_table, p_character), mx)
    || jsonb_build_object('faint', jsonb_build_object('hours', p_faint -> 'hours', 'fainted', (p_faint ->> 'fainted')::boolean));
  update public.table_character_state set state = st where table_id = p_table and character_id = p_character returning state into st;
  return st;
end $$;

revoke all on function public.state_resource_level(numeric, numeric), public.state_clean_max(jsonb), public.state_lock_for_edit(uuid, uuid),
  public.state_filled(jsonb, jsonb), public.state_incap_total(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.set_state_resource(uuid, uuid, text, int, jsonb), public.set_state_faint(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.set_state_resource(uuid, uuid, text, int, jsonb), public.set_state_faint(uuid, uuid, jsonb, jsonb) to authenticated;
