-- Incapacitacao nas rolagens da ficha (Savage Worlds, regras da mesa).
-- Vida e Stamina geram niveis (0: acima da metade, 1: na metade ou menos, 2: abaixo de 25%) que SOMAM.
-- Total 1 e 2 -> perde 1 estagio em todos os dados; total 3 e 4 -> perde 2 estagios.
-- Atributos nunca ficam abaixo de d4; pericias abaixo de d4 perdem 2 por estagio adicional.
-- Personagem desmaiado (Incapacitacao 5, marcado pelo mestre) nao rola atributos nem pericias.
-- O dado selvagem (d6) nao muda. A funcao e a mesma de 0004, so com o bloco de incapacitacao.

create or replace function public.roll_dice(
  p_table uuid, p_spec jsonb, p_label text default '', p_visibility text default 'public', p_character uuid default null
) returns public.table_rolls
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := auth.uid();
  kind text;
  modifier int;
  mode text;
  terms jsonb;
  term jsonb;
  cnt int; sides int; expl boolean; neg boolean;
  total_dice int := 0;
  attempts jsonb := '[]'::jsonb;
  groups jsonb; rolled jsonb; vals int[];
  sub int; gsum int; attempt_total int;
  totals int[] := '{}';
  n_attempts int; chosen int := 1; a int; i int;
  formula_parts text[] := '{}';
  formula text; res jsonb; final_total int;
  -- traco (Savage Worlds)
  tref jsonb; tname text; ttype text; cdata jsonb; die int; penalty int := 0; untrained boolean := false;
  -- incapacitacao (Vida + Stamina)
  cstate jsonb; ladder int[] := array[4, 6, 8, 10, 12]; vigor int; hp_cur int; st_cur int;
  hp_lv int := 0; st_lv int := 0; inc_total int := 0; inc_steps int := 0; base_die int; idx int; nxt int;
  wild boolean; target int; t_chain int[]; w_chain int[]; t_total int; w_total int; best int;
  crit boolean; success boolean; raises int;
  r public.table_rolls;
begin
  if uid is null then raise exception 'Entre na sua conta primeiro.'; end if;
  if not public.is_member(p_table) then raise exception 'Você não participa desta mesa.'; end if;
  if not public.table_accepts_messages(p_table) then raise exception 'Esta mesa está encerrada.'; end if;
  if p_visibility not in ('public', 'gm') then raise exception 'Visibilidade inválida.'; end if;
  if p_spec is null or jsonb_typeof(p_spec) <> 'object' or pg_column_size(p_spec) > 4000 then
    raise exception 'Rolagem inválida.';
  end if;
  if (select count(*) from public.table_rolls
      where table_id = p_table and user_id = uid and created_at > now() - interval '10 seconds') >= 30 then
    raise exception 'Você está rolando rápido demais.';
  end if;

  kind := p_spec->>'kind';
  modifier := coalesce((p_spec->>'modifier')::int, 0);
  if modifier not between -1000 and 1000 then raise exception 'Modificador fora do limite.'; end if;

  if kind = 'dice' then
    terms := p_spec->'dice';
    if terms is null or jsonb_typeof(terms) <> 'array' or jsonb_array_length(terms) not between 1 and 10 then
      raise exception 'Informe de 1 a 10 grupos de dados.';
    end if;
    mode := coalesce(p_spec->>'mode', 'normal');
    if mode not in ('normal', 'advantage', 'disadvantage') then raise exception 'Modo inválido.'; end if;
    n_attempts := case when mode = 'normal' then 1 else 2 end;

    for term in select * from jsonb_array_elements(terms) loop
      cnt := (term->>'count')::int;
      sides := (term->>'sides')::int;
      if cnt not between 1 and 50 or sides not in (4, 6, 8, 10, 12, 20, 100) then
        raise exception 'Dados inválidos. Use de 1 a 50 dados D4, D6, D8, D10, D12, D20 ou D100.';
      end if;
      total_dice := total_dice + cnt;
    end loop;
    if total_dice > 100 then raise exception 'Dados demais em uma rolagem (máximo 100).'; end if;

    for a in 1..n_attempts loop
      groups := '[]'::jsonb;
      sub := 0;
      for term in select * from jsonb_array_elements(terms) loop
        cnt := (term->>'count')::int;
        sides := (term->>'sides')::int;
        expl := coalesce((term->>'explode')::boolean, false);
        neg := coalesce((term->>'negative')::boolean, false);
        rolled := '[]'::jsonb;
        gsum := 0;
        for i in 1..cnt loop
          vals := public._roll_chain(sides, expl);
          rolled := rolled || jsonb_build_array(to_jsonb(vals));
          gsum := gsum + public._sum_ints(vals);
        end loop;
        groups := groups || jsonb_build_array(jsonb_build_object(
          'sides', sides, 'count', cnt, 'explode', expl, 'negative', neg, 'dice', rolled, 'subtotal', gsum));
        sub := sub + case when neg then -gsum else gsum end;
      end loop;
      attempt_total := sub + modifier;
      totals := totals || attempt_total;
      attempts := attempts || jsonb_build_array(jsonb_build_object('groups', groups, 'subtotal', sub, 'total', attempt_total));
    end loop;

    if mode = 'advantage' and totals[2] > totals[1] then chosen := 2; end if;
    if mode = 'disadvantage' and totals[2] < totals[1] then chosen := 2; end if;
    final_total := totals[chosen];

    for term in select * from jsonb_array_elements(terms) loop
      formula_parts := formula_parts || (
        case when coalesce((term->>'negative')::boolean, false) then '-' when array_length(formula_parts, 1) > 0 then '+' else '' end
        || (term->>'count') || 'd' || (term->>'sides') || case when coalesce((term->>'explode')::boolean, false) then '!' else '' end);
    end loop;
    formula := array_to_string(formula_parts, '')
      || case when modifier > 0 then '+' || modifier when modifier < 0 then modifier::text else '' end
      || case mode when 'advantage' then ' (vantagem)' when 'disadvantage' then ' (desvantagem)' else '' end;
    res := jsonb_build_object('kind', 'dice', 'mode', mode, 'modifier', modifier, 'attempts', attempts, 'chosen', chosen - 1);

  elsif kind = 'trait' then
    if p_character is null or not public.can_edit_state(p_table, p_character) then
      raise exception 'Escolha uma ficha sua vinculada a esta mesa.';
    end if;
    tref := p_spec->'trait';
    if tref is null or jsonb_typeof(tref) <> 'object' then raise exception 'Traço inválido.'; end if;
    ttype := tref->>'type';
    tname := left(coalesce(tref->>'name', ''), 40);
    if ttype not in ('attribute', 'skill') or tname = '' then raise exception 'Traço inválido.'; end if;
    select data into cdata from public.characters where id = p_character;
    if cdata is null then raise exception 'Ficha não encontrada.'; end if;
    -- Incapacitacao: niveis somam (Vida + Stamina). Dados: 0,1,1,2,2 estagios para os totais 0..4.
    select state into cstate from public.table_character_state where table_id = p_table and character_id = p_character;
    vigor := coalesce((cdata->'attributes'->>'Vigor')::int, 0);
    if cstate is not null and vigor > 0 then
      hp_cur := least(vigor, greatest(0, coalesce(nullif(cstate->>'life', '')::int, vigor)));
      st_cur := least(vigor, greatest(0, coalesce(nullif(cstate->>'stamina', '')::int, vigor)));
      hp_lv := case when hp_cur < vigor * 0.25 then 2 when hp_cur <= vigor / 2.0 then 1 else 0 end;
      st_lv := case when st_cur < vigor * 0.25 then 2 when st_cur <= vigor / 2.0 then 1 else 0 end;
      inc_total := hp_lv + st_lv;
      inc_steps := (array[0, 1, 1, 2, 2])[inc_total + 1];
      if inc_total >= 4 and coalesce((cstate->'faint'->>'fainted')::boolean, false) then
        raise exception 'Este personagem está desmaiado (Incapacitação 5) e não pode rolar.';
      end if;
    end if;

    if ttype = 'attribute' then
      base_die := (cdata->'attributes'->>tname)::int;
      if base_die is null or base_die not in (4, 6, 8, 10, 12) then raise exception 'Atributo inválido.'; end if;
      idx := array_position(ladder, base_die);
    else
      base_die := coalesce((cdata->'skills'->>tname)::int, 0);
      if base_die = 0 then untrained := true; idx := 0;
      elsif base_die not in (4, 6, 8, 10, 12) then raise exception 'Perícia inválida.';
      else idx := array_position(ladder, base_die); end if;
    end if;
    -- Perde `inc_steps` estagios. Atributo nunca abaixo de d4; pericia abaixo de d4 perde 2 por estagio (sem treino ja e d4-2).
    nxt := idx - inc_steps;
    if nxt >= 1 then die := ladder[nxt]; penalty := 0;
    elsif ttype = 'attribute' then die := 4; penalty := 0;
    else die := 4; penalty := -2 * (1 - nxt); end if;
    wild := coalesce((p_spec->>'wild')::boolean, true);
    target := coalesce((p_spec->>'target')::int, 4);
    if target not between 2 and 30 then raise exception 'Dificuldade fora do limite.'; end if;

    t_chain := public._roll_chain(die, true);
    t_total := public._sum_ints(t_chain);
    best := t_total;
    if wild then
      w_chain := public._roll_chain(6, true);
      w_total := public._sum_ints(w_chain);
      best := greatest(t_total, w_total);
    end if;
    crit := wild and t_chain[1] = 1 and w_chain[1] = 1;
    final_total := best + penalty + modifier;
    success := not crit and final_total >= target;
    raises := case when success then (final_total - target) / 4 else 0 end;
    formula := tname || ' d' || die || case when wild then ' + selvagem d6' else '' end
      || case when penalty <> 0 then penalty::text else '' end
      || case when modifier > 0 then '+' || modifier when modifier < 0 then modifier::text else '' end
      || ' vs ' || target;
    res := jsonb_build_object('kind', 'trait', 'name', tname, 'type', ttype, 'die', die, 'untrained', untrained,
      'wild', wild, 'traitRolls', to_jsonb(t_chain), 'traitTotal', t_total,
      'wildRolls', case when wild then to_jsonb(w_chain) end, 'wildTotal', w_total,
      'penalty', penalty, 'modifier', modifier, 'target', target,
      'criticalFailure', crit, 'success', success, 'raises', raises,
      'incap', jsonb_build_object('total', inc_total, 'steps', inc_steps, 'baseDie', base_die));
  else
    raise exception 'Tipo de rolagem inválido.';
  end if;

  insert into public.table_rolls (table_id, user_id, character_id, label, formula, spec, result, total, visibility)
  values (p_table, uid, case when kind = 'trait' then p_character end, left(coalesce(p_label, ''), 100),
          formula, p_spec, res, final_total, p_visibility)
  returning * into r;
  return r;
exception
  when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value or datatype_mismatch then
    raise exception 'Rolagem inválida.';
end $$;
