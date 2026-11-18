import { supabase } from './supabase.js';

const fail = (error, fallback) => { if (error) throw new Error(error.message || fallback); };

// Acumuladores de XP da mesa: { [character_id]: [{ kind, name, modality, available, earned_total, spent_total, discarded_total }] }.
// Devolve null se a migration 0024 ainda não foi rodada.
export async function loadProgress(tableId) {
  const { data, error } = await supabase.from('character_progress')
    .select('character_id,kind,name,modality,available,earned_total,spent_total,discarded_total,cap').eq('table_id', tableId).limit(5000);
  if (error) return null;
  const out = {};
  for (const r of data) (out[r.character_id] ||= []).push({ ...r, available: Number(r.available), earned_total: Number(r.earned_total), spent_total: Number(r.spent_total), discarded_total: Number(r.discarded_total) });
  return out;
}

// Horas de estudo e estado do dia por personagem: { [character_id]: { study_hours, day_no, day_state } }.
export async function loadTraining(tableId) {
  const { data, error } = await supabase.from('character_training').select('character_id,study_hours,astucia_dice_spent,day_no,day_state').eq('table_id', tableId);
  if (error) return null;
  return Object.fromEntries(data.map(r => [r.character_id, { study_hours: Number(r.study_hours), astucia_dice_spent: Number(r.astucia_dice_spent) || 0, day_no: r.day_no, day_state: r.day_state || {} }]));
}

// Ledger do personagem (mais recentes primeiro).
export async function loadRuns(tableId, characterId, { limit = 1000 } = {}) {
  const { data, error } = await supabase.from('table_routine_runs')
    .select('id,tick,day_no,slot,routine_name,row_snapshot,activity,ok,reason,stamina_delta,mana_delta,stamina_after,mana_after,xp,detail,created_at')
    .eq('table_id', tableId).eq('character_id', characterId).order('tick', { ascending: false }).limit(limit);
  if (error) return null;
  return data.map(r => ({ ...r, stamina_delta: Number(r.stamina_delta), mana_delta: Number(r.mana_delta) }));
}

// Mestre: avança o relógio e processa as atividades de todos os personagens, numa única transação no servidor.
export async function advanceTime(tableId, hours, expectedTick, kind, events, days) {
  const { data, error } = await supabase.rpc('advance_time', {
    p_table: tableId, p_hours: hours, p_expected_tick: expectedTick, p_kind: kind, p_events: events, p_days: days,
  });
  fail(error, 'Não foi possível avançar o tempo.');
  return data;
}

// Jogador: confirma a evolução de uma perícia ou atributo (o servidor confere custo e saldo e debita a XP).
export async function spendProgress(tableId, characterId, kind, name, modality) {
  const { data, error } = await supabase.rpc('spend_progress', { p_table: tableId, p_character: characterId, p_kind: kind, p_name: name, p_modality: modality });
  fail(error, 'Não foi possível evoluir.');
  return data;
}

// Dono da ficha: recolhe as evoluções confirmadas ([{ kind, name }]) para aplicar na ficha.
export async function claimEvolutions(characterId) {
  const { data, error } = await supabase.rpc('claim_evolutions', { p_character: characterId });
  fail(error, 'Não foi possível recolher as evoluções.');
  return Array.isArray(data) ? data : [];
}
