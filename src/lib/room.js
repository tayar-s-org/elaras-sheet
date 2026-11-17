import { supabase } from './supabase.js';

const fail = error => { if (error) throw new Error(error.message || 'Erro ao acessar a nuvem.'); };

export async function recentMessages(tableId, limit = 100) {
  const { data, error } = await supabase.from('table_messages')
    .select('id,user_id,kind,to_user,body,created_at').eq('table_id', tableId)
    .order('id', { ascending: false }).limit(limit);
  fail(error);
  return data.reverse();
}
export async function sendMessage(tableId, body, toUser = null) {
  const { data, error } = await supabase.from('table_messages')
    .insert({ table_id: tableId, body, kind: toUser ? 'whisper' : 'chat', to_user: toUser })
    .select('id,user_id,kind,to_user,body,created_at').single();
  fail(error);
  return data;
}
export async function loadStates(tableId) {
  const { data, error } = await supabase.from('table_character_state').select('character_id,state').eq('table_id', tableId);
  fail(error);
  return Object.fromEntries(data.map(r => [r.character_id, r.state]));
}
export async function saveState(tableId, characterId, state) {
  const { error } = await supabase.from('table_character_state')
    .upsert({ table_id: tableId, character_id: characterId, state }, { onConflict: 'table_id,character_id' });
  fail(error);
}
export async function loadCharacters(ids) {
  if (!ids.length) return {};
  const { data, error } = await supabase.from('characters').select('id,name,data').in('id', ids);
  fail(error);
  return Object.fromEntries(data.map(r => [r.id, r]));
}

const ROLL_COLS = 'id,user_id,character_id,label,formula,spec,result,total,visibility,created_at';
export async function recentRolls(tableId, limit = 50) {
  const { data, error } = await supabase.from('table_rolls').select(ROLL_COLS).eq('table_id', tableId)
    .order('id', { ascending: false }).limit(limit);
  fail(error);
  return data.reverse();
}
// O cliente envia so a especificacao; o servidor sorteia e grava.
export async function rollDice(tableId, spec, { label = '', visibility = 'public', characterId = null } = {}) {
  const { data, error } = await supabase.rpc('roll_dice', {
    p_table: tableId, p_spec: spec, p_label: label, p_visibility: visibility, p_character: characterId,
  });
  fail(error);
  return data;
}
