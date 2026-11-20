-- Estudo Magico: tirar o teto de 24 dados de Astucia no total GANHO.
-- Cada tentativa gasta 16 dados; com o total ganho limitado a 24, depois da 1a tentativa sobravam no maximo 8 dados para
-- sempre e nenhuma outra tentativa era possivel. Agora 25 h de estudo = 1 dado sem teto, e o custo de 16 por tentativa
-- continua igual. Decisao assumida: a regra de campanha para o teto nao estava definida; o saldo precisa poder se recompor.
-- Unica mudanca em relacao a 0025: total_dice deixa de usar least(24, ...). Pode rodar de novo (create or replace).
create or replace function public.attempt_spell_upgrade(p_request uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  rq record; cdata jsonb; adie int; abonus int := 0; tr record; sp record;
  total_dice int; avail int; n_done int; base_req int; eff numeric; pity_b int; pity_a int;
  rolls int[] := '{}'; i int; face int; sum_total int := 0; ok boolean; desc_text text; cost numeric;
begin
  select * into rq from public.routine_requests where id = p_request for update;
  if not found or rq.kind <> 'spell_study' then raise exception 'Solicitação não encontrada.'; end if;
  if not public.owns_character(rq.character_id) or not public.my_character_in(rq.table_id, rq.character_id) then raise exception 'Esta ficha não é sua nesta mesa.'; end if;
  if rq.status <> 'approved' then raise exception 'O mestre precisa aprovar a melhoria antes da tentativa.'; end if;
  if not public.table_accepts_messages(rq.table_id) then raise exception 'Esta mesa está encerrada.'; end if;
  select data into cdata from public.characters where id = rq.character_id;
  adie := coalesce((cdata -> 'attributes' ->> 'Astúcia')::int, 0);
  if adie not in (4, 6, 8, 10, 12) then raise exception 'Astúcia inválida na ficha.'; end if;
  if adie = 12 then abonus := least(50, greatest(0, coalesce((cdata -> 'bonuses' -> 'attributes' ->> 'Astúcia')::int, 0))); end if;
  insert into public.character_training (table_id, character_id) values (rq.table_id, rq.character_id) on conflict do nothing;
  select * into tr from public.character_training where table_id = rq.table_id and character_id = rq.character_id for update;
  total_dice := floor(tr.study_hours / 25)::int;
  avail := total_dice - tr.astucia_dice_spent;
  if avail < 16 then raise exception 'Você precisa de pelo menos 16 dados de Astúcia (tem %). Cada 25 horas de Estudo Mágico dão 1 dado.', avail; end if;
  insert into public.spell_progress (table_id, character_id, spell_id) values (rq.table_id, rq.character_id, rq.spell_id) on conflict do nothing;
  select * into sp from public.spell_progress where table_id = rq.table_id and character_id = rq.character_id and spell_id = rq.spell_id for update;
  n_done := sp.improvements;
  if n_done >= 10 then raise exception 'Este feitiço já tem o máximo de 10 melhorias.'; end if;
  base_req := public.upgrade_difficulty(n_done + 1);
  pity_b := sp.pity;
  eff := base_req * (100 - 10 * pity_b) / 100.0;
  for i in 1..16 loop
    face := 1 + floor(random() * adie)::int;
    rolls := rolls || face;
    sum_total := sum_total + face + abonus;
  end loop;
  ok := sum_total > eff;
  pity_a := case when ok then 0 when sum_total >= base_req * 0.5 then least(5, pity_b + 1) else pity_b end;
  cost := nullif(rq.config ->> 'xp_cost', '')::numeric;
  update public.character_training set astucia_dice_spent = astucia_dice_spent + 16, updated_at = now()
    where table_id = rq.table_id and character_id = rq.character_id;
  update public.spell_progress set pity = pity_a, improvements = improvements + case when ok then 1 else 0 end, updated_at = now()
    where table_id = rq.table_id and character_id = rq.character_id and spell_id = rq.spell_id;
  insert into public.spell_attempts (table_id, character_id, request_id, spell_id, improvement_no, rolls, die, bonus, total, required_base,
    required_effective, pity_before, pity_after, success, xp_cost_shown)
  values (rq.table_id, rq.character_id, rq.id, rq.spell_id, n_done + 1, rolls, adie, abonus, sum_total, base_req, eff, pity_b, pity_a, ok, cost);
  if ok then
    desc_text := coalesce(nullif(btrim(rq.config ->> 'description'), ''), rq.body);
    insert into public.spell_upgrade_awards (table_id, character_id, spell_id, n, description) values (rq.table_id, rq.character_id, rq.spell_id, n_done + 1, left(desc_text, 2000));
    perform set_config('elara.internal', '1', true);
    update public.routine_requests set status = 'done' where id = rq.id;
    perform set_config('elara.internal', '0', true);
  end if;
  return jsonb_build_object('success', ok, 'rolls', to_jsonb(rolls), 'die', adie, 'bonus', abonus, 'total', sum_total,
    'requiredBase', base_req, 'requiredEffective', eff, 'pityBefore', pity_b, 'pityAfter', pity_a, 'improvementNo', n_done + 1,
    'diceLeft', avail - 16, 'xpCost', cost);
end $$;
